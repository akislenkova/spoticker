"""
Fetches RunPod interruptible (spot) GPU prices and upserts into Supabase.

Environment variables:
  SUPABASE_URL  — https://xxxx.supabase.co
  SUPABASE_KEY  — service-role key

RunPod GraphQL pricing queries require no API key.
"""

import os
from datetime import datetime, timezone

import requests as http

from fetch_spot import fetch_spot_prices

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

BATCH = 500


def _upsert(table: str, rows: list[dict]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        resp = http.post(url, json=chunk, headers=HEADERS, timeout=30)
        if not resp.ok:
            print(f"  ERROR {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()
    print(f"  upserted {len(rows)} rows → {table}")


def run() -> None:
    ts = datetime.now(timezone.utc).isoformat()

    print("Fetching RunPod spot GPU prices …")
    raw = fetch_spot_prices()
    rows = [{**r, "fetched_at": ts} for r in raw]
    print(f"  {len(rows)} rows with spot pricing (from {len(raw)} GPU×tier pairs)")
    _upsert("runpod_spot_prices", rows)
    print("Done.")


if __name__ == "__main__":
    run()
