"""
Provisions one small spot VM per region for eviction telemetry.

Usage:
  python provision.py [--regions eastus,westus2,...] [--dry-run]

Requires:
  az login  (or service principal)
  SUPABASE_URL, SUPABASE_KEY (service role), COLLECTOR_URL, TELEMETRY_SECRET

Idempotent: skips regions that already have a pending or running VM.
Regions whose VM was evicted, never booted, or failed to create are left
to respawner.py.
"""

import argparse
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

from common import RESOURCE_GROUP, az, launch, sb_get

REGIONS = [
    "eastus", "eastus2", "westus2", "westus3", "centralus",
    "canadacentral",
    "westeurope", "northeurope", "uksouth", "francecentral",
    "germanywestcentral", "swedencentral",
    "southeastasia", "eastasia", "japaneast", "koreacentral",
    "australiaeast", "centralindia",
    "brazilsouth",
    "southafricanorth",
]


def tracked_regions() -> set[str]:
    """Regions that already have a non-retired row (any status)."""
    rows = sb_get("monitored_vms", {"status": "neq.retired", "select": "region"})
    return {r["region"] for r in rows}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--regions", help="Comma-separated regions (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be created, create nothing")
    args = parser.parse_args()

    regions = args.regions.split(",") if args.regions else REGIONS
    tracked = tracked_regions()
    todo = [r for r in regions if r not in tracked]
    for r in regions:
        if r in tracked:
            print(f"  {r}: skipped (already tracked; respawner.py handles its lifecycle)")

    if not todo:
        print("Nothing to provision.")
        return
    if args.dry_run:
        print(f"Would provision {len(todo)} region(s): {', '.join(todo)}")
        return

    try:
        az("group", "create", "--name", RESOURCE_GROUP, "--location", "eastus")
    except subprocess.CalledProcessError as e:
        raise SystemExit(f"Could not ensure resource group {RESOURCE_GROUP}: {e.stderr.strip()}")

    print(f"Provisioning {len(todo)} region(s) …")
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(launch, r): r for r in todo}
        for future in as_completed(futures):
            region = futures[future]
            try:
                _, msg = future.result()
            except Exception as exc:  # keep going for other regions
                msg = f"FAILED: {exc}"
            print(f"  {region}: {msg}")

    print("Done. First heartbeats expected within ~3 minutes (row flips pending → running).")


if __name__ == "__main__":
    main()
