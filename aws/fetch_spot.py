"""
Fetches AWS spot pricing from two sources:
  1. EC2 describe_spot_price_history (last 24 h, across all configured regions)
  2. spot-bid-advisor public JSON blob (single HTTP GET)
"""

import boto3
import requests
from botocore.exceptions import ClientError
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, timedelta

REGIONS = [
    "us-east-1", "us-east-2", "us-west-1", "us-west-2",
    "ca-central-1",
    "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-north-1",
    "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
    "ap-south-1", "ap-southeast-1", "ap-southeast-2",
    "sa-east-1",
]

SPOT_INSTANCE_TYPES = [
    # ── GPU: H200 ──────────────────────────────────────────────────────────────
    "p5e.48xlarge",
    # ── GPU: H100 ─────────────────────────────────────────────────────────────
    "p5.48xlarge",
    # ── GPU: A100 80GB (p4de = SXM4 80 GB) ───────────────────────────────────
    "p4de.24xlarge",
    # ── GPU: A100 40GB (p4d = SXM4 40 GB) ────────────────────────────────────
    "p4d.24xlarge",
    # ── GPU: L40S ─────────────────────────────────────────────────────────────
    "g6e.xlarge", "g6e.2xlarge", "g6e.12xlarge", "g6e.48xlarge",
    # ── GPU: L4 ───────────────────────────────────────────────────────────────
    "g6.xlarge", "g6.2xlarge", "g6.12xlarge", "g6.48xlarge",
    # ── GPU: A10G ─────────────────────────────────────────────────────────────
    "g5.xlarge", "g5.2xlarge", "g5.12xlarge", "g5.48xlarge",
    # ── GPU: T4 ───────────────────────────────────────────────────────────────
    "g4dn.xlarge", "g4dn.2xlarge", "g4dn.12xlarge",
    # ── GPU: V100 (p3) ────────────────────────────────────────────────────────
    "p3.2xlarge", "p3.8xlarge", "p3.16xlarge",
    # ── CPU: AMD EPYC (m7a / c7a) ─────────────────────────────────────────────
    "m7a.xlarge", "m7a.2xlarge", "m7a.4xlarge",
    "c7a.xlarge", "c7a.2xlarge", "c7a.4xlarge",
    # ── CPU: Intel (m7i / c7i) ────────────────────────────────────────────────
    "m7i.xlarge", "m7i.2xlarge", "m7i.4xlarge",
    "c7i.xlarge", "c7i.2xlarge", "c7i.4xlarge",
    # ── CPU: Graviton / ARM (m7g / c7g) ───────────────────────────────────────
    "m7g.xlarge", "m7g.2xlarge", "m7g.4xlarge",
    "c7g.xlarge", "c7g.2xlarge", "c7g.4xlarge",
]

BID_ADVISOR_URL = (
    "https://spot-bid-advisor.s3.amazonaws.com/spot-advisor-data.json"
)


def _fetch_region(region: str, since: datetime) -> tuple[list[dict], str | None]:
    ec2 = boto3.client("ec2", region_name=region)
    paginator = ec2.get_paginator("describe_spot_price_history")
    try:
        rows = []
        for page in paginator.paginate(
            InstanceTypes=SPOT_INSTANCE_TYPES,
            ProductDescriptions=["Linux/UNIX"],
            StartTime=since,
        ):
            for e in page["SpotPriceHistory"]:
                rows.append({
                    "region": region,
                    "az": e["AvailabilityZone"],
                    "instance_type": e["InstanceType"],
                    "price_usd": float(e["SpotPrice"]),
                    "timestamp": e["Timestamp"].isoformat(),
                })
        return rows, None
    except ClientError as exc:
        code = exc.response["Error"]["Code"]
        if code in ("AuthFailure", "OptInRequired", "UnauthorizedOperation"):
            return [], code
        raise


def fetch_spot_price_history(hours: int = 24) -> list[dict]:
    """describe_spot_price_history across all regions for the last `hours` hours."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    records: list[dict] = []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = {pool.submit(_fetch_region, r, since): r for r in REGIONS}
        for future in as_completed(futures):
            region = futures[future]
            rows, skip_code = future.result()
            if skip_code:
                print(f"  skipping {region}: {skip_code}")
            else:
                records.extend(rows)
    return records


def fetch_bid_advisor() -> dict:
    """Single HTTP GET of the spot-bid-advisor public JSON blob."""
    resp = requests.get(BID_ADVISOR_URL, timeout=30)
    resp.raise_for_status()
    return resp.json()
