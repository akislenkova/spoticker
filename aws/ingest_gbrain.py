"""
Ingests live Spotticker GPU spot pricing into GBrain.
Reads from Supabase, writes one page per (instance_type × region).

Usage:
  SUPABASE_URL=... SUPABASE_KEY=... python aws/ingest_gbrain.py
  SUPABASE_URL=... SUPABASE_KEY=... python aws/ingest_gbrain.py --cloud azure
  SUPABASE_URL=... SUPABASE_KEY=... python aws/ingest_gbrain.py --cloud all
"""

import os
import sys
import subprocess
import argparse
import requests
from datetime import datetime, timezone

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY", "")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

GBRAIN = os.path.expanduser("~/.bun/bin/gbrain")
GBRAIN_ENV = {**os.environ, "PATH": f"{os.path.expanduser('~/.bun/bin')}:{os.environ.get('PATH', '')}"}

# GPU counts per AWS instance type
GPU_COUNT: dict[str, int] = {
    "g4dn.xlarge": 1, "g4dn.2xlarge": 1, "g4dn.4xlarge": 1,
    "g4dn.8xlarge": 1, "g4dn.12xlarge": 4, "g4dn.16xlarge": 1, "g4dn.metal": 8,
    "g5.xlarge": 1, "g5.2xlarge": 1, "g5.4xlarge": 1, "g5.8xlarge": 1,
    "g5.12xlarge": 4, "g5.16xlarge": 1, "g5.24xlarge": 4, "g5.48xlarge": 8,
    "g6.xlarge": 1, "g6.2xlarge": 1, "g6.4xlarge": 1, "g6.8xlarge": 1,
    "g6.12xlarge": 4, "g6.16xlarge": 1, "g6.24xlarge": 4, "g6.48xlarge": 8,
    "p3.2xlarge": 1, "p3.8xlarge": 4, "p3.16xlarge": 8, "p3dn.24xlarge": 8,
    "p4d.24xlarge": 8,
    "p4de.24xlarge": 8,
    "p5.48xlarge": 8,
}

GPU_TYPE: dict[str, str] = {
    "g4dn": "T4", "g5": "A10G", "g6": "L4",
    "p3": "V100", "p4d": "A100 (40GB)", "p4de": "A100 (80GB)", "p5": "H100",
}

WORKLOAD_NOTES: dict[str, tuple[str, str]] = {
    "T4":         ("batch jobs, smaller fine-tunes, cost-sensitive inference",
                   "real-time inference without checkpointing, large model training"),
    "A10G":       ("batch inference, mid-size fine-tunes, A10G-optimised workloads",
                   "stateful training without checkpointing"),
    "L4":         ("transformer inference, batch jobs, cost-sensitive fine-tuning",
                   "real-time latency-sensitive serving"),
    "V100":       ("batch training, legacy model fine-tunes",
                   "new workloads (A100 is cheaper and faster), real-time inference"),
    "A100 (40GB)":("large model training, fine-tuning, high-throughput batch inference",
                   "real-time inference, stateful training without checkpointing"),
    "A100 (80GB)":("very large model training (70B+), fine-tuning with full-precision weights",
                   "real-time inference, stateful training without checkpointing"),
    "H100":       ("frontier model training, maximum throughput batch inference",
                   "cost-sensitive workloads, real-time serving where A100 suffices"),
}

RISK_LABEL = {0: "<5%", 1: "5-10%", 2: "10-15%", 3: "15-20%", 4: ">20%"}
RISK_TIER = {0: "LOW", 1: "LOW", 2: "MEDIUM", 3: "MEDIUM", 4: "HIGH"}


def _rpc(name: str) -> list[dict]:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/rpc/{name}",
        headers=HEADERS, timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _table(name: str, select: str = "*", order: str = "", limit: int = 1) -> list[dict]:
    params: dict[str, str] = {"select": select, "limit": str(limit)}
    if order:
        params["order"] = order
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/{name}",
        headers=HEADERS, params=params, timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _put_page(slug: str, content: str) -> None:
    result = subprocess.run(
        [GBRAIN, "put", slug],
        input=content,
        text=True,
        capture_output=True,
        env=GBRAIN_ENV,
    )
    if result.returncode != 0:
        print(f"  [WARN] gbrain put failed for {slug}: {result.stderr.strip()}", file=sys.stderr)
    else:
        print(f"  wrote  {slug}")


def _aws_gpu_type(instance_type: str) -> str | None:
    family = instance_type.split(".")[0]
    return GPU_TYPE.get(family)


def ingest_aws() -> None:
    print("Fetching AWS spot prices from Supabase…")
    prices = _rpc("latest_aws_spot_prices")
    print(f"  {len(prices)} rows")

    print("Fetching spot-bid-advisor blob…")
    advisor_rows = _table("spot_bid_advisor", select="data", order="fetched_at.desc", limit=1)
    advisor_blob = advisor_rows[0]["data"].get("spot_advisor", {}) if advisor_rows else {}

    now = datetime.now(timezone.utc).isoformat()
    ingested = 0

    for row in prices:
        itype = row["instance_type"]
        region = row["region"]
        price_usd = float(row["price_usd"])
        gpu_type = _aws_gpu_type(itype)
        if not gpu_type:
            continue

        gpu_count = GPU_COUNT.get(itype, 1)
        instance_total = price_usd * gpu_count

        region_advisor = advisor_blob.get(region, {}).get("Linux", {})
        entry = region_advisor.get(itype)
        eviction_label = RISK_LABEL.get(entry["r"]) if entry else "unknown"
        risk_tier = RISK_TIER.get(entry["r"], "UNKNOWN") if entry else "UNKNOWN"

        rec_for, not_rec_for = WORKLOAD_NOTES.get(gpu_type, ("general GPU workloads", "real-time inference"))

        slug = f"spotticker/aws/{region}/{itype.replace('.', '-')}"
        title = f"{gpu_type} spot {region} (AWS {itype})"

        content = f"""---
title: "{title}"
type: concept
tags: [spotticker, gpu-spot, aws, {gpu_type.lower().replace(" ", "-").replace("(", "").replace(")", "")}, {region}]
---

# {title}

Cloud: AWS
Instance: {itype}
GPU type: {gpu_type}
GPUs per instance: {gpu_count}

Current spot price: ${price_usd:.4f}/hr per GPU (${instance_total:.2f}/hr for {gpu_count}-GPU instance)
Eviction rate (7-day): {eviction_label}
Risk tier: {risk_tier}
Region: {region}

Recommended for: {rec_for}
Not recommended for: {not_rec_for}

Last updated: {now}
Source: Spotticker pricing catalog — AWS describe_spot_price_history + spot-bid-advisor
"""
        _put_page(slug, content)
        ingested += 1

    print(f"AWS: {ingested} pages written to GBrain.")


def ingest_azure() -> None:
    print("Fetching Azure spot prices from Supabase…")
    prices = _rpc("latest_azure_spot_prices")
    print(f"  {len(prices)} rows")

    print("Fetching Azure eviction rates…")
    evictions_raw = _rpc("latest_azure_eviction_rates")
    eviction_map: dict[str, str] = {
        f"{e['skuName'].lower()}::{e['location'].lower()}": e.get("evictionRate", "unknown")
        for e in evictions_raw
    }

    AZURE_GPU_PATTERNS = [
        ("T4", "T4"), ("A100", "A100"), ("A10", "A10G"), ("L4", "L4"),
        ("V100", "V100"), ("H100", "H100"),
    ]

    def azure_gpu(sku: str) -> str | None:
        for kw, label in AZURE_GPU_PATTERNS:
            if kw.lower() in sku.lower():
                return label
        return None

    def azure_risk_tier(rate_str: str) -> str:
        s = rate_str.lower()
        if s.startswith("0-5") or s == "<5%":
            return "LOW"
        if s.startswith("5-10") or s.startswith("10-15"):
            return "MEDIUM"
        if s.startswith("15") or s.startswith(">20") or s.startswith("20"):
            return "HIGH"
        return "UNKNOWN"

    now = datetime.now(timezone.utc).isoformat()
    ingested = 0

    for row in prices:
        arm_sku = row.get("arm_sku_name") or row.get("sku_name") or ""
        region = row["region"]
        price = float(row["retail_price"])
        gpu_type = azure_gpu(arm_sku)
        if not gpu_type:
            continue

        eviction_label = eviction_map.get(f"{arm_sku}::{region}", "unknown")
        risk_tier = azure_risk_tier(eviction_label)
        rec_for, not_rec_for = WORKLOAD_NOTES.get(gpu_type, ("general GPU workloads", "real-time inference"))

        slug_key = arm_sku.lower().replace(" ", "-").replace("_", "-")
        slug = f"spotticker/azure/{region}/{slug_key}"
        title = f"{gpu_type} spot {region} (Azure {arm_sku})"

        content = f"""---
title: "{title}"
type: concept
tags: [spotticker, gpu-spot, azure, {gpu_type.lower().replace(" ", "-")}, {region}]
---

# {title}

Cloud: Azure
SKU: {arm_sku}
GPU type: {gpu_type}

Current spot price: ${price:.4f}/hr per GPU
Eviction rate: {eviction_label}
Risk tier: {risk_tier}
Region: {region}

Recommended for: {rec_for}
Not recommended for: {not_rec_for}

Last updated: {now}
Source: Spotticker pricing catalog — Azure Retail Prices API
"""
        _put_page(slug, content)
        ingested += 1

    print(f"Azure: {ingested} pages written to GBrain.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Spotticker pricing into GBrain")
    parser.add_argument("--cloud", choices=["aws", "azure", "all"], default="all")
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_KEY must be set.", file=sys.stderr)
        sys.exit(1)

    if args.cloud in ("aws", "all"):
        ingest_aws()
    if args.cloud in ("azure", "all"):
        ingest_azure()

    print("\nDone. Run: gbrain embed --stale")


if __name__ == "__main__":
    main()
