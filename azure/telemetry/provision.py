"""
Provisions one B1s spot VM per region for eviction telemetry.

Usage:
  python provision.py [--regions eastus,westus2,...]

Requires:
  az login  (or service principal env vars)
  SUPABASE_URL, SUPABASE_KEY, COLLECTOR_URL, TELEMETRY_SECRET env vars

Idempotent — skips regions that already have a running monitored_vm.
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests as http

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
COLLECTOR_URL = os.environ["COLLECTOR_URL"]
TELEMETRY_SECRET = os.environ.get("TELEMETRY_SECRET", "")

RESOURCE_GROUP = "spotticker-telemetry"
IMAGE = "Ubuntu2204"
ADMIN_USER = "spotticker"

# Tried in order — cheapest first, fall back if spot capacity unavailable
FALLBACK_SKUS = [
    "Standard_B1s",
    "Standard_B2s",
    "Standard_D2s_v3",
    "Standard_D2as_v4",
]

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

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

AGENT_SOURCE = (Path(__file__).parent / "agent.py").read_text()
CLOUD_INIT_TEMPLATE = (Path(__file__).parent / "cloud_init.sh").read_text()


def az(*args) -> str:
    result = subprocess.run(
        ["az", *args, "--output", "json"],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


def already_running(region: str) -> bool:
    resp = http.get(
        f"{SUPABASE_URL}/rest/v1/monitored_vms",
        params={"region": f"eq.{region}", "status": "eq.running"},
        headers=SUPABASE_HEADERS,
    )
    return len(resp.json()) > 0


def register_vm(region: str, vm_id: str, vm_name: str, sku: str) -> None:
    http.post(
        f"{SUPABASE_URL}/rest/v1/monitored_vms",
        json={
            "vm_id": vm_id,
            "region": region,
            "sku": sku,
            "status": "running",
            "started_at": None,
        },
        headers=SUPABASE_HEADERS,
    )


def build_cloud_init(vm_id: str, region: str, sku: str) -> str:
    script = (
        CLOUD_INIT_TEMPLATE
        .replace("{{AGENT_SOURCE}}", AGENT_SOURCE)
        .replace("{{COLLECTOR_URL}}", COLLECTOR_URL)
        .replace("{{TELEMETRY_SECRET}}", TELEMETRY_SECRET)
        .replace("{{VM_ID}}", vm_id)
        .replace("{{REGION}}", region)
        .replace("{{SKU}}", sku)
    )
    return base64.b64encode(script.encode()).decode()


def provision_region(region: str) -> tuple[str, str]:
    if already_running(region):
        return region, "skipped (already running)"

    vm_name = f"spotticker-{region}"

    for sku in FALLBACK_SKUS:
        cloud_init_b64 = build_cloud_init(
            f"/subscriptions/placeholder/resourceGroups/{RESOURCE_GROUP}/providers/Microsoft.Compute/virtualMachines/{vm_name}",
            region,
            sku,
        )
        try:
            result = json.loads(az(
                "vm", "create",
                "--resource-group", RESOURCE_GROUP,
                "--name", vm_name,
                "--location", region,
                "--image", IMAGE,
                "--size", sku,
                "--priority", "Spot",
                "--eviction-policy", "Delete",
                "--max-price", "-1",
                "--admin-username", ADMIN_USER,
                "--generate-ssh-keys",
                "--custom-data", cloud_init_b64,
                "--public-ip-sku", "Standard",
            ))
            actual_id = result.get("id", vm_name)
            register_vm(region, actual_id, vm_name, sku)
            return region, f"provisioned ({sku})"
        except subprocess.CalledProcessError as e:
            if "SkuNotAvailable" in e.stderr:
                continue  # try next SKU
            return region, f"FAILED: {e.stderr}"

    return region, f"FAILED: no spot capacity available for any SKU in {region}"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--regions", help="Comma-separated regions (default: all)")
    args = parser.parse_args()

    regions = args.regions.split(",") if args.regions else REGIONS

    # Ensure resource group exists
    try:
        az("group", "create", "--name", RESOURCE_GROUP, "--location", "eastus")
    except subprocess.CalledProcessError:
        pass  # Already exists

    print(f"Provisioning {len(regions)} regions …")
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(provision_region, r): r for r in regions}
        for future in as_completed(futures):
            region, status = future.result()
            print(f"  {region}: {status}")

    print("Done. VMs are starting up — first heartbeats expected within ~3 minutes.")


if __name__ == "__main__":
    main()
