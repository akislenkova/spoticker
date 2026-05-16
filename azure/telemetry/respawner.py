"""
Checks for VMs with stale heartbeats, records missed-heartbeat evictions,
and reprovisioning new VMs to replace them.

Designed to run every 15 minutes via GitHub Actions cron.

Env vars: SUPABASE_URL, SUPABASE_KEY, COLLECTOR_URL, TELEMETRY_SECRET
"""

import os
import json
import subprocess
import base64
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests as http

SUPABASE_URL  = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY  = os.environ["SUPABASE_KEY"]
COLLECTOR_URL = os.environ["COLLECTOR_URL"]
TELEMETRY_SECRET = os.environ.get("TELEMETRY_SECRET", "")

RESOURCE_GROUP   = "spotticker-telemetry"
SKU              = "Standard_B1s"
IMAGE            = "Ubuntu2204"
ADMIN_USER       = "spotticker"
STALE_THRESHOLD  = timedelta(minutes=10)  # no heartbeat → evicted

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


def get_stale_vms() -> list[dict]:
    cutoff = (datetime.now(timezone.utc) - STALE_THRESHOLD).isoformat()
    resp = http.get(
        f"{SUPABASE_URL}/rest/v1/monitored_vms",
        params={
            "status": "eq.running",
            "last_heartbeat": f"lt.{cutoff}",
        },
        headers=SUPABASE_HEADERS,
    )
    return resp.json()


def record_eviction(vm: dict) -> None:
    uptime = None
    if vm.get("started_at"):
        started = datetime.fromisoformat(vm["started_at"])
        uptime = int((datetime.now(timezone.utc) - started).total_seconds())

    http.post(
        f"{SUPABASE_URL}/rest/v1/eviction_events",
        json={
            "vm_id": vm["vm_id"],
            "region": vm["region"],
            "sku": vm["sku"],
            "detection_method": "missed_heartbeat",
            "uptime_seconds": uptime,
        },
        headers=SUPABASE_HEADERS,
    )
    http.patch(
        f"{SUPABASE_URL}/rest/v1/monitored_vms?id=eq.{vm['id']}",
        json={"status": "evicted", "vm_id": None},
        headers=SUPABASE_HEADERS,
    )


def build_cloud_init(vm_id: str, region: str) -> str:
    script = (
        CLOUD_INIT_TEMPLATE
        .replace("{{AGENT_SOURCE}}", AGENT_SOURCE)
        .replace("{{COLLECTOR_URL}}", COLLECTOR_URL)
        .replace("{{TELEMETRY_SECRET}}", TELEMETRY_SECRET)
        .replace("{{VM_ID}}", vm_id)
        .replace("{{REGION}}", region)
        .replace("{{SKU}}", SKU)
    )
    return base64.b64encode(script.encode()).decode()


def reprovision(region: str, monitored_id: str) -> None:
    vm_name = f"spotticker-{region}"
    placeholder_id = f"pending-{monitored_id}"
    cloud_init_b64 = build_cloud_init(placeholder_id, region)

    try:
        result = json.loads(az(
            "vm", "create",
            "--resource-group", RESOURCE_GROUP,
            "--name", vm_name,
            "--location", region,
            "--image", IMAGE,
            "--size", SKU,
            "--priority", "Spot",
            "--eviction-policy", "Delete",
            "--max-price", "-1",
            "--admin-username", ADMIN_USER,
            "--generate-ssh-keys",
            "--custom-data", cloud_init_b64,
            "--public-ip-sku", "Standard",
        ))
        new_vm_id = result.get("id", placeholder_id)

        http.patch(
            f"{SUPABASE_URL}/rest/v1/monitored_vms?id=eq.{monitored_id}",
            json={
                "vm_id": new_vm_id,
                "status": "running",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "last_heartbeat": None,
            },
            headers=SUPABASE_HEADERS,
        )
        print(f"  {region}: reprovisioned → {new_vm_id[:60]}")
    except subprocess.CalledProcessError as e:
        print(f"  {region}: reprovision FAILED — {e.stderr[:200]}")
        http.patch(
            f"{SUPABASE_URL}/rest/v1/monitored_vms?id=eq.{monitored_id}",
            json={"status": "reprovisioning"},
            headers=SUPABASE_HEADERS,
        )


def main() -> None:
    stale = get_stale_vms()
    if not stale:
        print("All VMs healthy.")
        return

    print(f"{len(stale)} stale VM(s) detected:")
    for vm in stale:
        print(f"  {vm['region']} — last heartbeat: {vm.get('last_heartbeat', 'never')}")
        record_eviction(vm)
        reprovision(vm["region"], vm["id"])


if __name__ == "__main__":
    main()
