"""
Shared helpers for the Azure eviction-telemetry fleet (provision.py, respawner.py).

Identity model: each VM incarnation gets a logical `vm_id` that we generate
*before* creating the VM, register in monitored_vms, and bake into the agent's
cloud-init. The agent heartbeats with that same id, so the collector's
`eq("vm_id", ...)` lookup always matches. (Previously the agent got a
placeholder id while the row stored the Azure resource id, so no heartbeat
ever matched.)

Row lifecycle (monitored_vms.status):
  pending        — registered, VM created/booting, no heartbeat yet
  running        — set by /api/telemetry/heartbeat on first heartbeat
  evicted        — set by /api/telemetry/eviction (IMDS Preempt) or the respawner
  reprovisioning — last create attempt failed; respawner retries it
"""

import tempfile
import json
import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

import requests as http

# Optional local env file (gitignored via `.env*`); real env vars take precedence.
_ENV_FILE = Path(__file__).parent / ".env"
if _ENV_FILE.exists():
    for _line in _ENV_FILE.read_text().splitlines():
        if "=" in _line and not _line.lstrip().startswith("#"):
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
COLLECTOR_URL = os.environ["COLLECTOR_URL"].rstrip("/")
# The collector fails closed without a secret, so an agent without one can never report.
TELEMETRY_SECRET = os.environ.get("TELEMETRY_SECRET", "")
if not TELEMETRY_SECRET:
    raise SystemExit("TELEMETRY_SECRET must be set (the collector rejects unauthenticated heartbeats)")

RESOURCE_GROUP = os.environ.get("TELEMETRY_RESOURCE_GROUP", "spotticker-telemetry")
IMAGE = "Ubuntu2204"
ADMIN_USER = "spotticker"

# Tried in order, cheapest first. B-series is not offered as Spot, so it is not listed.
FALLBACK_SKUS = [
    "Standard_D2s_v3",
    "Standard_D2as_v4",
    "Standard_D2s_v5",
    "Standard_D2as_v5",
    # v7 only: some regions (francecentral, germanywestcentral) restrict this
    # subscription to v7 sizes. "l" = low-memory, cheapest.
    "Standard_D2als_v7",
    "Standard_D2ls_v7",
]

# Errors that mean "this SKU has no spot capacity / isn't offered here, try the next one".
CAPACITY_ERRORS = (
    "SkuNotAvailable",
    "OverconstrainedAllocationRequest",
    "AllocationFailed",
    "ZonalAllocationFailed",
    "SpotVMNotSupported",
    "QuotaExceeded",
    "OperationNotAllowed",
)

SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

_HERE = Path(__file__).parent
AGENT_SOURCE = (_HERE / "agent.py").read_text()
CLOUD_INIT_TEMPLATE = (_HERE / "cloud_init.sh").read_text()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def az(*args: str) -> str:
    result = subprocess.run(
        ["az", *args, "--output", "json"],
        capture_output=True, text=True, check=True,
    )
    return result.stdout.strip()


# ── Supabase ────────────────────────────────────────────────────────────────

def sb_get(table: str, params: dict) -> list[dict]:
    resp = http.get(f"{SUPABASE_URL}/rest/v1/{table}", params=params, headers=SUPABASE_HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.json()


def sb_post(table: str, payload: dict, params: dict | None = None, prefer: str | None = None) -> None:
    headers = {**SUPABASE_HEADERS, **({"Prefer": prefer} if prefer else {})}
    resp = http.post(f"{SUPABASE_URL}/rest/v1/{table}", params=params, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()


def sb_patch(table: str, row_id: str, payload: dict) -> None:
    resp = http.patch(
        f"{SUPABASE_URL}/rest/v1/{table}",
        params={"id": f"eq.{row_id}"},
        json=payload,
        headers=SUPABASE_HEADERS,
        timeout=30,
    )
    resp.raise_for_status()


def register_pending(region: str, sku: str, vm_id: str) -> None:
    """Upsert the (region, sku) row for a new incarnation, before the VM exists."""
    sb_post(
        "monitored_vms",
        {
            "vm_id": vm_id,
            "region": region,
            "sku": sku,
            "status": "pending",
            "started_at": now_iso(),
            "last_heartbeat": None,
        },
        params={"on_conflict": "region,sku"},
        prefer="resolution=merge-duplicates",
    )


# ── Azure ───────────────────────────────────────────────────────────────────

def vm_name_for(region: str) -> str:
    return f"spotticker-{region}"


def new_vm_id(region: str) -> str:
    return f"spotticker-{region}-{uuid.uuid4().hex[:12]}"


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
    # Return the raw script: `az vm create --custom-data` base64-encodes it
    # itself. Encoding here too made the VM receive base64 text, which
    # cloud-init ignored, so the agent was never installed.
    # az sends custom data through a latin-1 path; keep it ASCII (comments had em-dashes).
    return script.encode("ascii", "replace").decode()


def delete_vm_if_exists(region: str) -> None:
    """Remove a leftover VM with this region's name (e.g. alive but agent dead),
    since `az vm create` cannot change custom data on an existing VM."""
    try:
        az("vm", "delete", "--resource-group", RESOURCE_GROUP, "--name", vm_name_for(region), "--yes")
    except subprocess.CalledProcessError as e:
        if "ResourceNotFound" not in e.stderr and "was not found" not in e.stderr:
            raise


def create_spot_vm(region: str, sku: str, vm_id: str) -> str:
    """Create the spot VM. Returns the Azure resource id. Raises CalledProcessError."""
    # Pass the script as a file (0600, removed afterwards) so the secret isn't in argv.
    fd, path = tempfile.mkstemp(prefix="spotticker-cloudinit-", suffix=".sh")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(build_cloud_init(vm_id, region, sku))
        return _create_spot_vm(region, sku, vm_id, path)
    finally:
        os.unlink(path)


def _create_spot_vm(region: str, sku: str, vm_id: str, custom_data_path: str) -> str:
    result = json.loads(az(
        "vm", "create",
        "--resource-group", RESOURCE_GROUP,
        "--name", vm_name_for(region),
        "--location", region,
        "--image", IMAGE,
        "--size", sku,
        "--priority", "Spot",
        "--eviction-policy", "Delete",
        "--max-price", "-1",
        "--admin-username", ADMIN_USER,
        "--generate-ssh-keys",
        "--nsg-rule", "NONE",  # agent is outbound-only; don't expose SSH
        "--os-disk-delete-option", "Delete",  # eviction otherwise orphans the disk (28 leaked in May)
        "--storage-sku", "StandardSSD_LRS",   # Premium is wasted on a heartbeat agent
        "--nic-delete-option", "Delete",
        "--custom-data", custom_data_path,
        "--public-ip-sku", "Standard",  # needed for outbound internet on new VNets
        "--tags", f"spotticker-vm-id={vm_id}", "purpose=eviction-telemetry",
    ))
    return result.get("id", "")


def az_error(stderr: str) -> str:
    """az prints several WARNING lines before the real error; keep only the error."""
    lines = [l for l in stderr.splitlines() if l.strip() and not l.startswith("WARNING")
             and not l.startswith("Selecting ") and "aka.ms" not in l]
    return " ".join(lines)[:400]


def is_capacity_error(stderr: str) -> bool:
    return any(code in stderr for code in CAPACITY_ERRORS)


def retire_other_skus(region: str, keep_sku: str) -> None:
    """One VM per region (they share a VM name). When we land on a different SKU,
    retire the region's other rows so the respawner stops chasing them."""
    rows = sb_get("monitored_vms", {"region": f"eq.{region}", "sku": f"neq.{keep_sku}", "select": "id,status"})
    for row in rows:
        if row["status"] != "retired":
            sb_patch("monitored_vms", row["id"], {"status": "retired"})


def launch(region: str, preferred_sku: str | None = None) -> tuple[str | None, str]:
    """Register + create a fresh incarnation in `region`, falling back across SKUs.

    Returns (sku, message). sku is None on failure.
    Note monitored_vms is unique on (region, sku): if we fall back to a
    different SKU, that becomes a separate row, which keeps per-SKU
    eviction stats honest.
    """
    skus = [preferred_sku] + [s for s in FALLBACK_SKUS if s != preferred_sku] if preferred_sku else FALLBACK_SKUS
    delete_vm_if_exists(region)

    last_err = ""
    for sku in skus:
        vm_id = new_vm_id(region)
        register_pending(region, sku, vm_id)
        try:
            create_spot_vm(region, sku, vm_id)
            retire_other_skus(region, keep_sku=sku)
            return sku, f"created {sku} as {vm_id}"
        except subprocess.CalledProcessError as e:
            last_err = az_error(e.stderr)
            # Don't leave a pending row behind for a SKU we couldn't get.
            rows = sb_get("monitored_vms", {"region": f"eq.{region}", "sku": f"eq.{sku}", "select": "id"})
            for row in rows:
                sb_patch("monitored_vms", row["id"], {"status": "reprovisioning"})
            if is_capacity_error(e.stderr):
                continue
            return None, f"FAILED ({sku}): {last_err}"

    return None, f"FAILED: no spot capacity for any SKU ({last_err})"
