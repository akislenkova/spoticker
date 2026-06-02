"""
Fetch RunPod GPU spot (interruptible) pricing via the public GraphQL API.
No API key required for gpuTypes / lowestPrice queries.
"""

from __future__ import annotations

import requests

GRAPHQL_URL = "https://api.runpod.io/graphql"

GPU_TYPES_QUERY = """
query GpuSpotPricing {
  gpuTypes {
    id
    displayName
    memoryInGb
    secureCloud
    communityCloud
    communitySpotPrice
    secureSpotPrice
    communityPrice
    securePrice
    communityLowest: lowestPrice(input: { gpuCount: 1, secureCloud: false }) {
      minimumBidPrice
      uninterruptablePrice
      stockStatus
    }
    secureLowest: lowestPrice(input: { gpuCount: 1, secureCloud: true }) {
      minimumBidPrice
      uninterruptablePrice
      stockStatus
    }
  }
}
"""


def _spot_for_tier(gpu: dict, tier: str) -> float | None:
    """Resolve per-GPU-hour spot price for community or secure cloud."""
    if tier == "community":
        if not gpu.get("communityCloud"):
            return None
        spot = gpu.get("communitySpotPrice")
        lowest = gpu.get("communityLowest") or {}
        return spot if spot is not None else lowest.get("minimumBidPrice")
    if tier == "secure":
        if not gpu.get("secureCloud"):
            return None
        spot = gpu.get("secureSpotPrice")
        lowest = gpu.get("secureLowest") or {}
        return spot if spot is not None else lowest.get("minimumBidPrice")
    raise ValueError(f"unknown tier: {tier}")


def _on_demand_for_tier(gpu: dict, tier: str) -> float | None:
    if tier == "community":
        if not gpu.get("communityCloud"):
            return None
        price = gpu.get("communityPrice")
        lowest = gpu.get("communityLowest") or {}
        return price if price is not None else lowest.get("uninterruptablePrice")
    if tier == "secure":
        if not gpu.get("secureCloud"):
            return None
        price = gpu.get("securePrice")
        lowest = gpu.get("secureLowest") or {}
        return price if price is not None else lowest.get("uninterruptablePrice")
    raise ValueError(f"unknown tier: {tier}")


def _stock_for_tier(gpu: dict, tier: str) -> str | None:
    lowest = gpu.get("communityLowest" if tier == "community" else "secureLowest") or {}
    return lowest.get("stockStatus")


def fetch_spot_prices() -> list[dict]:
    """
    Returns normalized rows: one per (gpu_type_id, cloud_tier) with a spot price.
    Prices are USD per GPU-hour (RunPod quotes per-GPU for single-GPU pods).
    """
    resp = requests.post(
        GRAPHQL_URL,
        json={"query": GPU_TYPES_QUERY},
        headers={"Content-Type": "application/json"},
        timeout=60,
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("errors"):
        raise RuntimeError(f"RunPod GraphQL errors: {body['errors']}")

    records: list[dict] = []
    for gpu in body.get("data", {}).get("gpuTypes", []):
        gpu_type_id = gpu.get("id")
        if not gpu_type_id:
            continue
        for tier in ("community", "secure"):
            spot = _spot_for_tier(gpu, tier)
            if spot is None:
                continue
            records.append({
                "gpu_type_id": gpu_type_id,
                "cloud_tier": tier,
                "display_name": gpu.get("displayName"),
                "memory_gb": gpu.get("memoryInGb"),
                "spot_price_usd_per_gpu": float(spot),
                "on_demand_price_usd": _on_demand_for_tier(gpu, tier),
                "stock_status": _stock_for_tier(gpu, tier),
            })
    return records
