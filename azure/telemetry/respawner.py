"""
Keeps the eviction-telemetry fleet alive. Run on a schedule (see
.github/workflows/azure-telemetry-respawn.yml).

Each run, per region:
  running, heartbeat older than STALE_THRESHOLD  → record missed_heartbeat eviction, relaunch
  evicted (agent saw IMDS Preempt)               → relaunch (event already recorded by collector)
  pending, no heartbeat after BOOT_GRACE         → boot failure (not an eviction), relaunch
  reprovisioning (last create failed)            → retry
  retired                                        → ignored

Usage:
  python respawner.py [--dry-run]
"""

import argparse
from datetime import datetime, timedelta, timezone

from common import launch, now_iso, sb_get, sb_patch, sb_post

STALE_THRESHOLD = timedelta(minutes=10)  # running + no heartbeat for this long → evicted
BOOT_GRACE = timedelta(minutes=15)       # pending this long without a first heartbeat → boot failed


def parse_ts(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def classify(vm: dict, now: datetime) -> str | None:
    """Returns why this row needs a relaunch, or None if it's healthy."""
    status = vm["status"]
    last_hb = parse_ts(vm.get("last_heartbeat"))
    started = parse_ts(vm.get("started_at"))

    if status == "evicted":
        return "evicted"
    if status == "reprovisioning":
        return "retry"
    if status == "running":
        if last_hb and now - last_hb > STALE_THRESHOLD:
            return "stale"
        if not last_hb and (not started or now - started > BOOT_GRACE):
            return "never_booted"  # legacy rows registered as running with no heartbeat
        return None
    if status == "pending":
        if not started or now - started > BOOT_GRACE:
            return "never_booted"
        return None
    return None


def record_missed_heartbeat(vm: dict, now: datetime) -> None:
    started = parse_ts(vm.get("started_at"))
    sb_post("eviction_events", {
        "vm_id": vm["vm_id"],
        "region": vm["region"],
        "sku": vm["sku"],
        "detection_method": "missed_heartbeat",
        "uptime_seconds": int((now - started).total_seconds()) if started else None,
    })
    sb_patch("monitored_vms", vm["id"], {"status": "evicted", "last_heartbeat": None})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    now = datetime.now(timezone.utc)
    rows = sb_get("monitored_vms", {"status": "neq.retired", "select": "*"})

    # One VM per region; if a region somehow has several rows, act once.
    actions: dict[str, tuple[dict, str]] = {}
    for vm in rows:
        reason = classify(vm, now)
        if reason and vm["region"] not in actions:
            actions[vm["region"]] = (vm, reason)

    if not actions:
        print(f"All {len(rows)} VM(s) healthy at {now_iso()}.")
        return

    print(f"{len(actions)} region(s) need attention:")
    for region, (vm, reason) in sorted(actions.items()):
        print(f"  {region} [{vm['sku']}] — {reason}, last heartbeat: {vm.get('last_heartbeat') or 'never'}")
        if args.dry_run:
            continue
        if reason == "stale":
            record_missed_heartbeat(vm, now)
        try:
            _, msg = launch(region, preferred_sku=vm["sku"])
        except Exception as exc:  # one bad region shouldn't stop the rest
            msg = f"FAILED: {exc}"
            sb_patch("monitored_vms", vm["id"], {"status": "reprovisioning"})
        print(f"    → {msg}")


if __name__ == "__main__":
    main()
