"""Stage 3: Deterministic ranking of PlacementCandidates from the spot matrix."""
from __future__ import annotations
import os
import re

from app.schemas import (
    ExtractedSpec, PlacementCandidate, Objective, EvictionConfidence,
)

# GPU compatibility: requested → acceptable (equal or better)
_GPU_COMPAT: dict[str, list[str]] = {
    "T4":       ["T4", "A10G", "L4", "V100", "A100-40GB", "A100-80GB", "H100"],
    "A10G":     ["A10G", "A100-40GB", "A100-80GB", "H100"],
    "L4":       ["L4", "A10G", "A100-40GB", "A100-80GB", "H100"],
    "V100":     ["V100", "A100-40GB", "A100-80GB", "H100"],
    "A100":     ["A100-40GB", "A100-80GB", "H100"],
    "A100-40GB": ["A100-40GB", "A100-80GB", "H100"],
    "A100-80GB": ["A100-80GB", "H100"],
    "H100":     ["H100"],
}

_EVICTION_MIDPOINTS: dict[str, float] = {
    "<5%": 2.5, "0-5%": 2.5,
    "5-10%": 7.5,
    "10-15%": 12.5,
    "15-20%": 17.5,
    ">20%": 25.0,
}

_AWS_FAMILY_GPU: dict[str, str] = {
    "g4dn": "T4", "g5": "A10G", "g6": "L4",
    "p3": "V100", "p4d": "A100-40GB", "p4de": "A100-40GB", "p5": "H100",
}
_AWS_GPU_COUNTS: dict[str, int] = {
    "g4dn.xlarge": 1, "g4dn.2xlarge": 1, "g4dn.4xlarge": 1,
    "g4dn.8xlarge": 1, "g4dn.12xlarge": 4, "g4dn.16xlarge": 1, "g4dn.metal": 8,
    "g5.xlarge": 1, "g5.2xlarge": 1, "g5.4xlarge": 1, "g5.8xlarge": 1,
    "g5.12xlarge": 4, "g5.16xlarge": 1, "g5.24xlarge": 4, "g5.48xlarge": 8,
    "p3.2xlarge": 1, "p3.8xlarge": 4, "p3.16xlarge": 8, "p3dn.24xlarge": 8,
    "p4d.24xlarge": 8, "p4de.24xlarge": 8, "p5.48xlarge": 8,
}

# Rough on-demand price estimates ($/hr total) for savings calculation
_ONDEMAND_ESTIMATES: dict[str, float] = {
    "p5.48xlarge": 98.32, "p4d.24xlarge": 32.77, "p4de.24xlarge": 40.97,
    "p3dn.24xlarge": 31.22, "p3.16xlarge": 24.48, "p3.8xlarge": 12.24,
    "g5.48xlarge": 16.29, "g5.12xlarge": 5.67, "g5.4xlarge": 2.03,
    "g5.2xlarge": 1.21, "g5.xlarge": 1.01,
    "g4dn.12xlarge": 3.91, "g4dn.metal": 7.82, "g4dn.8xlarge": 2.26,
}


def _compatible_gpu_types(requested: str | None) -> list[str]:
    if not requested:
        return list(set(g for gs in _GPU_COMPAT.values() for g in gs))
    key = requested.upper().replace(" ", "")
    for k, v in _GPU_COMPAT.items():
        if k.upper().replace(" ", "") == key:
            return v
    # Fuzzy match
    for k, v in _GPU_COMPAT.items():
        if k.upper() in key or key in k.upper():
            return v
    return [requested]


def _eviction_midpoint(label: str | None, gpu_fallback_pct: float = 12.5) -> float:
    if not label:
        return gpu_fallback_pct
    for key, mid in _EVICTION_MIDPOINTS.items():
        if label.startswith(key.rstrip("%")) or label == key:
            return mid
    # Try to parse numeric ranges like "5-10%"
    m = re.match(r"(\d+)-(\d+)", label)
    if m:
        return (int(m.group(1)) + int(m.group(2))) / 2
    m = re.match(r"~([\d.]+)%", label)
    if m:
        return float(m.group(1))
    return gpu_fallback_pct


def _azure_gpu_type(sku_name: str) -> str | None:
    patterns = [
        (re.compile(r"H100", re.I), "H100"),
        (re.compile(r"A100.*80", re.I), "A100-80GB"),
        (re.compile(r"A100", re.I), "A100-40GB"),
        (re.compile(r"V100", re.I), "V100"),
        (re.compile(r"L4\b", re.I), "L4"),
        (re.compile(r"A10G|A10\b", re.I), "A10G"),
        (re.compile(r"T4\b", re.I), "T4"),
    ]
    for pat, label in patterns:
        if pat.search(sku_name):
            return label
    return None


def _gcp_gpu_type(description: str) -> str | None:
    patterns = [
        (re.compile(r"\bH100\b", re.I), "H100"),
        (re.compile(r"\bA100\b", re.I), "A100-40GB"),
        (re.compile(r"\bV100\b", re.I), "V100"),
        (re.compile(r"\bL4\b", re.I), "L4"),
        (re.compile(r"\bA10\b", re.I), "A10G"),
        (re.compile(r"\bT4\b", re.I), "T4"),
    ]
    for pat, label in patterns:
        if pat.search(description):
            return label
    return None


def _fetch_candidates_from_supabase(acceptable_gpu_types: list[str]) -> list[dict]:
    """Query Supabase and return raw candidate dicts."""
    from supabase import create_client  # type: ignore

    url = os.environ["SUPABASE_URL"]
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY", "")
    sb = create_client(url, key)

    candidates: list[dict] = []

    # ── AWS ──────────────────────────────────────────────────────────────────
    prices_resp = sb.rpc("latest_aws_spot_prices").execute()
    advisor_resp = (
        sb.from_("spot_bid_advisor")
        .select("data")
        .order("fetched_at", desc=True)
        .limit(1)
        .execute()
    )
    advisor_blob = {}
    if advisor_resp.data:
        advisor_blob = (advisor_resp.data[0].get("data") or {}).get("spot_advisor") or {}

    for row in prices_resp.data or []:
        family = (row.get("instance_type") or "").split(".")[0]
        gpu = _AWS_FAMILY_GPU.get(family)
        if not gpu or gpu not in acceptable_gpu_types:
            continue
        instance = row["instance_type"]
        region = row["region"]
        region_adv = (advisor_blob.get(region) or {}).get("Linux") or {}
        entry = region_adv.get(instance)
        eviction_label = None
        eviction_pct = None
        if entry is not None:
            r = entry.get("r", 4)
            labels = ["<5%", "5-10%", "10-15%", "15-20%", ">20%"]
            eviction_label = labels[r] if r < len(labels) else ">20%"
            eviction_pct = _eviction_midpoint(eviction_label)

        ondemand = _ONDEMAND_ESTIMATES.get(instance)
        candidates.append({
            "cloud": "aws",
            "region": region,
            "sku": instance,
            "gpu_type": gpu,
            "gpu_count": _AWS_GPU_COUNTS.get(instance, 1),
            "hourly_price": float(row["price_usd"]),
            "eviction_label": eviction_label,
            "eviction_pct": eviction_pct,
            "eviction_confidence": "high" if eviction_pct is not None else "low",
            "ondemand_price": ondemand,
            "ondemand_url": f"https://aws.amazon.com/ec2/spot/instance-advisor/",
        })

    # ── Azure ─────────────────────────────────────────────────────────────────
    azure_resp = sb.rpc("latest_azure_spot_prices").execute()
    ev_resp = (
        sb.from_("azure_spot_eviction_rates")
        .select("skuName, location, evictionRate")
        .order("fetched_at", desc=True)
        .limit(2000)
        .execute()
    )
    ev_map: dict[str, str] = {}
    for e in ev_resp.data or []:
        if e.get("skuName") and e.get("location"):
            k = f"{e['skuName'].lower()}::{e['location'].lower()}"
            if k not in ev_map:
                ev_map[k] = e.get("evictionRate") or ""

    for row in azure_resp.data or []:
        sku = row.get("arm_sku_name") or row.get("sku_name") or ""
        gpu = _azure_gpu_type(sku)
        if not gpu or gpu not in acceptable_gpu_types:
            continue
        region = row.get("region") or ""
        ev_key = f"{sku.lower()}::{region.lower()}"
        ev_label = ev_map.get(ev_key)
        ev_pct = _eviction_midpoint(ev_label) if ev_label else None

        candidates.append({
            "cloud": "azure",
            "region": region,
            "sku": sku,
            "gpu_type": gpu,
            "gpu_count": 1,  # Azure pricing is per-GPU — scaled in rank()
            "price_per_gpu": float(row["retail_price"]),
            "hourly_price": float(row["retail_price"]),
            "eviction_label": ev_label,
            "eviction_pct": ev_pct,
            "eviction_confidence": "high" if ev_pct is not None else "low",
            "ondemand_price": None,
            "ondemand_url": f"https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/",
        })

    # ── GCP ───────────────────────────────────────────────────────────────────
    gcp_resp = (
        sb.from_("gcp_spot_prices")
        .select("description, regions, price_usd_per_hour")
        .execute()
    )
    for row in gcp_resp.data or []:
        gpu = _gcp_gpu_type(row.get("description") or "")
        if not gpu or gpu not in acceptable_gpu_types:
            continue
        raw_regions = row.get("regions")
        if isinstance(raw_regions, str):
            import json
            raw_regions = json.loads(raw_regions)
        for region in (raw_regions or []):
            candidates.append({
                "cloud": "gcp",
                "region": region,
                "sku": row.get("description") or "",
                "gpu_type": gpu,
                "gpu_count": 1,  # GCP pricing is per-GPU — scaled in rank()
                "price_per_gpu": float(row["price_usd_per_hour"]),
                "hourly_price": float(row["price_usd_per_hour"]),
                "eviction_label": None,
                "eviction_pct": None,
                "eviction_confidence": "low",
                "ondemand_price": None,
                "ondemand_url": f"https://cloud.google.com/compute/docs/gpus",
            })

    return candidates


def _normalise_scores(values: list[float]) -> list[float]:
    mn, mx = min(values), max(values)
    if mx == mn:
        return [0.5] * len(values)
    return [(v - mn) / (mx - mn) for v in values]


def rank(spec: ExtractedSpec, objective: Objective) -> list[PlacementCandidate]:
    """Stage 3: filter and rank candidates. Returns top 5."""
    acceptable = _compatible_gpu_types(spec.resources.gpu_type)
    raw = _fetch_candidates_from_supabase(acceptable)

    min_gpus = spec.resources.gpu_count or 1

    # For per-GPU priced clouds (Azure, GCP), scale price and count to requested quantity.
    # For AWS, filter out instances that don't have enough GPUs.
    scaled: list[dict] = []
    for c in raw:
        if c.get("price_per_gpu") is not None:
            # Azure/GCP: multiply to get the cost for the requested GPU count
            c = c.copy()
            c["hourly_price"] = c["price_per_gpu"] * min_gpus
            c["gpu_count"] = min_gpus
            scaled.append(c)
        elif c["gpu_count"] >= min_gpus:
            scaled.append(c)
    raw = scaled

    if not raw:
        return []

    # Deduplicate: keep cheapest per (cloud, region, gpu_type)
    deduped: dict[str, dict] = {}
    for c in raw:
        key = f"{c['cloud']}::{c['region']}::{c['gpu_type']}"
        if key not in deduped or c["hourly_price"] < deduped[key]["hourly_price"]:
            deduped[key] = c
    raw = list(deduped.values())

    if objective == Objective.cost:
        raw.sort(key=lambda c: c["hourly_price"])

    elif objective == Objective.cost_reliability:
        prices = [c["hourly_price"] for c in raw]
        # Use 12.5 (median) for unknowns to avoid penalising/rewarding them
        evictions = [c["eviction_pct"] if c["eviction_pct"] is not None else 12.5 for c in raw]
        price_norm = _normalise_scores(prices)
        eviction_norm = _normalise_scores(evictions)
        for i, c in enumerate(raw):
            c["_score"] = 0.6 * price_norm[i] + 0.4 * eviction_norm[i]
        raw.sort(key=lambda c: c["_score"])

    elif objective == Objective.ha_multi_cloud:
        # Pick best per cloud first, then fill remaining from any cloud
        best_per_cloud: dict[str, dict] = {}
        for c in sorted(raw, key=lambda x: x["hourly_price"]):
            if c["cloud"] not in best_per_cloud:
                best_per_cloud[c["cloud"]] = c
        cloud_picks = list(best_per_cloud.values())
        rest = [c for c in raw if c not in cloud_picks]
        raw = cloud_picks + rest

    top5 = raw[:5]

    # Convert to PlacementCandidate
    result: list[PlacementCandidate] = []
    for c in top5:
        duration = spec.duration_hours or 1.0
        replicas = spec.resources.replicas or 1
        estimated_total = c["hourly_price"] * duration * replicas

        ondemand = c.get("ondemand_price")
        savings = None
        savings_pct = None
        if ondemand and ondemand > c["hourly_price"]:
            savings = (ondemand - c["hourly_price"]) * duration
            savings_pct = int((savings / (ondemand * duration)) * 100)

        rationale = _build_rationale(c, objective)

        result.append(PlacementCandidate(
            cloud=c["cloud"],
            region=c["region"],
            sku=c["sku"],
            gpu_type=c["gpu_type"],
            gpu_count=c["gpu_count"],
            hourly_price=c["hourly_price"],
            eviction_rate_pct=c["eviction_pct"],
            eviction_confidence=EvictionConfidence(c["eviction_confidence"]),
            estimated_total=round(estimated_total, 2),
            estimated_savings_vs_ondemand=round(savings, 2) if savings else None,
            savings_pct=savings_pct,
            ondemand_price=ondemand,
            rationale=rationale,
            ondemand_url=c.get("ondemand_url"),
        ))

    return result


def _build_rationale(c: dict, objective: Objective) -> list[str]:
    notes = []
    if objective == Objective.cost:
        notes.append(f"lowest spot price among compatible {c['gpu_type']} instances")
    elif objective == Objective.cost_reliability:
        ev = c.get("eviction_pct")
        if ev is not None and ev < 10:
            notes.append("strong cost-reliability balance: low eviction risk")
        else:
            notes.append("cost-reliability weighted score")
    elif objective == Objective.ha_multi_cloud:
        notes.append(f"best option in {c['cloud']} for multi-cloud redundancy")

    ev_label = c.get("eviction_label")
    if ev_label:
        notes.append(f"eviction rate {ev_label}")
    elif c["eviction_confidence"] == "low":
        notes.append("eviction data unavailable — treat as medium risk")

    return notes

