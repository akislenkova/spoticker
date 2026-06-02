"""
Fetch Vast.ai interruptible (bid) GPU offers via the public REST API.
No API key required for marketplace search.
"""

from __future__ import annotations

import re
from typing import Literal

import requests

BUNDLES_URL = "https://console.vast.ai/api/v0/bundles/"

# Normalized GpuLabel values we persist (must match ui/lib/gpu-map.ts)
GPU_LABELS = (
    "H200",
    "H100",
    "B300",
    "B200",
    "A100 80GB",
    "A100 40GB",
    "V100",
    "L40S",
    "L4",
    "A10G",
    "T4",
)

# Order: specific patterns before general (mirrors gpu-map.ts)
_GPU_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bB300\b", re.I), "B300"),
    (re.compile(r"\bB200\b", re.I), "B200"),
    (re.compile(r"\bH200\b", re.I), "H200"),
    (re.compile(r"\bH100\b", re.I), "H100"),
    (re.compile(r"A100.*80\s*GB", re.I), "A100 80GB"),
    (re.compile(r"A100.*40\s*GB", re.I), "A100 40GB"),
    (re.compile(r"\bA100\b", re.I), "A100 80GB"),
    (re.compile(r"\bV100\b", re.I), "V100"),
    (re.compile(r"\bL40S\b", re.I), "L40S"),
    (re.compile(r"\bL40\b", re.I), "L40S"),
    (re.compile(r"\bL4\b", re.I), "L4"),
    (re.compile(r"\bA10\b", re.I), "A10G"),
    (re.compile(r"\bT4\b", re.I), "T4"),
]

Tier = Literal["community", "secure"]


def vast_gpu_label(gpu_name: str) -> str | None:
    for pattern, label in _GPU_PATTERNS:
        if pattern.search(gpu_name):
            return label
    return None


def _per_gpu_price(offer: dict) -> float | None:
    total = offer.get("dph_total")
    if total is None:
        return None
    num_gpus = offer.get("num_gpus") or 1
    try:
        n = int(num_gpus)
    except (TypeError, ValueError):
        n = 1
    return float(total) / max(n, 1)


def _fetch_tier(tier: Tier, *, limit: int = 2000) -> list[dict]:
    verification = "verified" if tier == "secure" else "unverified"
    body = {
        "rentable": {"eq": True},
        "num_gpus": {"gte": 1},
        "type": "bid",
        "verification": {"eq": verification},
        "limit": limit,
        "order": [["dph_total", "asc"]],
    }
    resp = requests.post(
        BUNDLES_URL,
        json=body,
        headers={"Content-Type": "application/json"},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(f"Vast.ai API error: {data}")
    return data.get("offers") or []


def fetch_spot_prices() -> list[dict]:
    """
    Returns one row per (gpu_label, cloud_tier) with the cheapest interruptible
    per-GPU-hour price and the host reliability of that winning offer.
    """
    best: dict[tuple[str, Tier], dict] = {}
    counts: dict[tuple[str, Tier], int] = {}

    for tier in ("community", "secure"):
        for offer in _fetch_tier(tier):
            gpu_name = offer.get("gpu_name")
            if not gpu_name:
                continue
            label = vast_gpu_label(gpu_name)
            if not label or label not in GPU_LABELS:
                continue
            price = _per_gpu_price(offer)
            if price is None:
                continue

            key = (label, tier)
            counts[key] = counts.get(key, 0) + 1
            row = best.get(key)
            if row is None or price < row["spot_price_usd_per_gpu"]:
                reliability = offer.get("reliability")
                best[key] = {
                    "gpu_label": label,
                    "cloud_tier": tier,
                    "gpu_name": gpu_name,
                    "display_name": gpu_name,
                    "gpu_ram_mb": offer.get("gpu_ram"),
                    "spot_price_usd_per_gpu": price,
                    "min_bid_usd_per_gpu": offer.get("min_bid"),
                    "reliability": float(reliability) if reliability is not None else None,
                }

    for key, row in best.items():
        row["offer_count"] = counts.get(key, 0)
    return list(best.values())
