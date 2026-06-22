"""Spoticker MCP server — GPU spot price tools and workload placement analysis."""
from __future__ import annotations

from dotenv import load_dotenv
load_dotenv()

from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "spoticker",
    instructions=(
        "GPU spot price intelligence across AWS, Azure, GCP, RunPod, CoreWeave, and Nebius. "
        "Use get_spot_prices for quick price lookups. "
        "Use analyze_workload with a Dockerfile, k8s manifest, or Terraform file to get "
        "a ranked placement recommendation and a deployment-ready diff."
    ),
)


@mcp.tool()
def get_spot_prices(
    gpu_type: str | None = None,
    cloud: str | None = None,
    min_gpus: int = 1,
    limit: int = 20,
) -> list[dict]:
    """
    Query live GPU spot prices from the Spoticker database.

    Args:
        gpu_type: GPU model to filter by, e.g. "H100", "A100-80GB", "A100-40GB",
                  "V100", "A10G", "L4", "T4". Omit to return all GPU types.
        cloud: Cloud provider to filter by — "aws", "azure", or "gcp". Omit for all.
        min_gpus: Minimum number of GPUs required (default 1). For per-GPU-priced
                  clouds (Azure, GCP) the hourly price is scaled to this count.
        limit: Maximum number of results (default 20), sorted by hourly price ascending.

    Returns:
        List of spot price records sorted cheapest-first. Each record includes:
        - cloud, region, sku, gpu_type, gpu_count, hourly_price_usd, ondemand_price_usd
        - eviction_rate: rate label (e.g. "<5%", "5-10%") or null
        - eviction_source: "aws_spot_advisor" | "azure_eviction_api" | null
        - eviction_note: plain-language description of data provenance or why it's absent
    """
    try:
        from app.stages.rank import (
            _fetch_candidates_from_supabase,
            _compatible_gpu_types,
            _GPU_COMPAT,
        )
    except ImportError as _e:
        raise RuntimeError(
            f"Import failed: {_e} | __file__={__file__} | sys.path[:4]={__import__('sys').path[:4]}"
        ) from _e

    if gpu_type:
        acceptable = _compatible_gpu_types(gpu_type)
    else:
        acceptable = list({g for gs in _GPU_COMPAT.values() for g in gs})

    candidates = _fetch_candidates_from_supabase(acceptable)

    if cloud:
        candidates = [c for c in candidates if c.get("cloud") == cloud.lower()]

    filtered: list[dict] = []
    for c in candidates:
        if c.get("price_per_gpu") is not None:
            c = c.copy()
            c["hourly_price"] = c["price_per_gpu"] * min_gpus
            c["gpu_count"] = min_gpus
            filtered.append(c)
        elif c.get("gpu_count", 1) >= min_gpus:
            filtered.append(c)

    filtered.sort(key=lambda c: c["hourly_price"])

    return [_format_candidate(c) for c in filtered[:limit]]


_EVICTION_META: dict[str, tuple[str | None, str]] = {
    "aws":   ("aws_spot_advisor",   "AWS Spot Bid Advisor — actual interruption frequency bucket"),
    "azure": ("azure_eviction_api", "Azure Eviction Rate API — coarse bucket (0-5%, 5-10%, etc.)"),
    "gcp":   (None,                 "GCP does not publish preemption rates"),
}


def _format_candidate(c: dict) -> dict:
    cloud = c["cloud"]
    source, base_note = _EVICTION_META.get(cloud, (None, "Eviction data unavailable"))
    ev_label = c.get("eviction_label")
    if ev_label:
        note = f"{base_note}; rate bucket: {ev_label}"
    elif source is None:
        note = base_note
    else:
        note = f"{base_note}; no data for this SKU/region"
    return {
        "cloud": cloud,
        "region": c["region"],
        "sku": c["sku"],
        "gpu_type": c["gpu_type"],
        "gpu_count": c.get("gpu_count", 1),
        "hourly_price_usd": round(c["hourly_price"], 4),
        "ondemand_price_usd": c.get("ondemand_price"),
        "eviction_rate": ev_label,
        "eviction_source": source,
        "eviction_note": note,
    }


@mcp.tool()
def get_spot_placement_score(
    instance_type: str,
    target_capacity: int = 1,
    regions: list[str] | None = None,
    aws_profile: str | None = None,
) -> list[dict]:
    """
    Query AWS Spot Placement Scores for an instance type via the EC2 API.

    Returns a real-time 1–10 likelihood score per region indicating how likely
    AWS is to fulfill a spot request right now. Higher = better availability.
    Scores reflect live capacity — they change frequently and are more actionable
    than historical eviction buckets for placement decisions.

    Credentials are resolved in order: aws_profile (if given) → env vars
    (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY) → ~/.aws/credentials default profile.
    Needs ec2:DescribeSpotPlacementScores permission.

    Args:
        instance_type: EC2 instance type, e.g. "p5.48xlarge", "p4d.24xlarge", "g5.xlarge".
        target_capacity: Number of instances requested (affects score). Default 1.
        regions: AWS region names to score, e.g. ["us-east-1", "us-west-2"].
                 Omit to score all regions where the instance type is available.
        aws_profile: Named profile from ~/.aws/credentials to use, e.g. "work", "staging".
                     Omit to use the default credential chain.

    Returns:
        List of {region, score, instance_type} sorted by score descending (10 = best).
    """
    import boto3
    from botocore.exceptions import ClientError, NoCredentialsError, ProfileNotFound

    try:
        session = boto3.Session(profile_name=aws_profile) if aws_profile else boto3.Session()
        ec2 = session.client("ec2", region_name="us-east-1")

        kwargs: dict = {
            "InstanceTypes": [instance_type],
            "TargetCapacity": target_capacity,
            "TargetCapacityUnitType": "units",
            "SingleAvailabilityZone": False,
        }
        if regions:
            kwargs["RegionNames"] = regions

        scores: list[dict] = []
        paginator = ec2.get_paginator("describe_spot_placement_scores")
        for page in paginator.paginate(**kwargs):
            for entry in page.get("SpotPlacementScores", []):
                scores.append({
                    "region": entry["Region"],
                    "score": entry["Score"],
                    "instance_type": instance_type,
                })

        scores.sort(key=lambda x: x["score"], reverse=True)
        return scores

    except NoCredentialsError:
        raise RuntimeError(
            "No AWS credentials found. Set AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY "
            "in the MCP server env, or configure ~/.aws/credentials."
        )
    except ProfileNotFound:
        raise RuntimeError(
            f"AWS profile {aws_profile!r} not found in ~/.aws/credentials. "
            "Run `aws configure --profile <name>` to create it."
        )
    except ClientError as e:
        raise RuntimeError(f"AWS API error: {e.response['Error']['Message']}")


@mcp.tool()
def analyze_workload(
    files: list[dict],
    objective: str = "cost_reliability",
    intent: str | None = None,
) -> dict:
    """
    Analyze a GPU workload and recommend optimal spot placement with a deployment diff.

    Runs a 5-stage pipeline: parse artifact → infer missing specs via Claude →
    rank candidates from live spot data → rewrite artifact → validate output.

    Args:
        files: Source files as a list of {"path": "<filename>", "content": "<text>"}.
               Accepts Dockerfiles, Kubernetes YAML, Terraform (.tf), Helm values.
               Pass multiple files if your workload spans several configs.
        objective: Optimization goal — one of:
                   "cost"              — absolute cheapest spot price,
                   "cost_reliability"  — weighted cost + eviction rate (recommended),
                   "ha_multi_cloud"    — best option per cloud for redundancy.
        intent: Optional free-text description to guide inference when the artifact
                is ambiguous, e.g. "train a 7B LLaMA model for 8 hours, need 2xH100".

    Returns:
        PlanResult with:
          spec             — extracted workload spec (GPU type/count, kind, env, etc.)
          candidates       — top 5 ranked placements with prices and eviction rates
          chosen           — the top recommendation
          rewrite          — unified diff + migration_commands to update your artifact
          validation_passed — whether the rewritten artifact passed structural validation
          error            — set if no candidates were found or pipeline failed
    """
    from app.pipeline import run_pipeline  # type: ignore[import]
    from app.schemas import Objective, SourceFile  # type: ignore[import]

    valid = {o.value for o in Objective}
    if objective not in valid:
        raise ValueError(f"objective must be one of {sorted(valid)}, got {objective!r}")

    source_files = [SourceFile(path=f["path"], content=f["content"]) for f in files]

    result = run_pipeline(
        files=source_files,
        objective=Objective(objective),
        user_intent=intent,
    )
    return result.model_dump()


def main() -> None:
    mcp.run()


if __name__ == "__main__":
    main()
