#!/usr/bin/env python3
"""
Spot VM heartbeat agent. Installed via cloud-init, runs as a systemd service.

Env vars (set by cloud-init):
  COLLECTOR_URL      — https://your-app.vercel.app
  TELEMETRY_SECRET   — shared secret for the collector
  VM_ID              — Azure resource ID of this VM
  REGION             — Azure region, e.g. eastus
  SKU                — VM size, e.g. Standard_B1s
"""

import os
import sys
import time
import signal
import requests

COLLECTOR_URL    = os.environ["COLLECTOR_URL"].rstrip("/")
TELEMETRY_SECRET = os.environ.get("TELEMETRY_SECRET", "")
VM_ID            = os.environ["VM_ID"]
REGION           = os.environ["REGION"]
SKU              = os.environ["SKU"]

HEARTBEAT_INTERVAL = 60   # seconds between heartbeats
IMDS_INTERVAL      = 15   # seconds between IMDS eviction checks

IMDS_EVENTS_URL = (
    "http://169.254.169.254/metadata/scheduledevents"
    "?api-version=2020-07-01"
)

HEADERS = {
    "x-telemetry-secret": TELEMETRY_SECRET,
    "Content-Type": "application/json",
}


def post(path: str, payload: dict) -> None:
    try:
        requests.post(
            f"{COLLECTOR_URL}{path}",
            json=payload,
            headers=HEADERS,
            timeout=10,
        )
    except Exception as exc:
        print(f"[agent] POST {path} failed: {exc}", file=sys.stderr)


def heartbeat() -> None:
    post("/api/telemetry/heartbeat", {"vm_id": VM_ID, "region": REGION, "sku": SKU})


def send_eviction(method: str) -> None:
    post("/api/telemetry/eviction", {"vm_id": VM_ID, "region": REGION, "sku": SKU, "method": method})


def check_imds_preempt() -> bool:
    """Returns True if Azure has scheduled a Preempt event for this VM."""
    try:
        resp = requests.get(
            IMDS_EVENTS_URL,
            headers={"Metadata": "true"},
            timeout=5,
        )
        for event in resp.json().get("Events", []):
            if event.get("EventType") == "Preempt":
                return True
    except Exception:
        pass
    return False


def handle_sigterm(_signum, _frame):
    # Graceful shutdown — not an eviction, don't log it
    sys.exit(0)


def main() -> None:
    signal.signal(signal.SIGTERM, handle_sigterm)
    print(f"[agent] started vm={VM_ID} region={REGION} sku={SKU}")

    last_heartbeat = 0.0
    last_imds      = 0.0

    while True:
        now = time.monotonic()

        if now - last_imds >= IMDS_INTERVAL:
            if check_imds_preempt():
                print("[agent] Preempt event detected — signalling eviction")
                send_eviction("scheduled_event")
                sys.exit(0)
            last_imds = now

        if now - last_heartbeat >= HEARTBEAT_INTERVAL:
            heartbeat()
            last_heartbeat = now

        time.sleep(5)


if __name__ == "__main__":
    main()
