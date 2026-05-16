"""
Pulls AWS spot pricing and upserts it into Supabase.

Environment variables required:
  SUPABASE_URL  — e.g. https://xxxx.supabase.co
  SUPABASE_KEY  — service-role key (needs INSERT on both tables)

Tables expected in Supabase:

  spot_price_history
    region          text
    az              text
    instance_type   text
    price_usd       numeric
    timestamp       timestamptz
    -- primary key / unique: (az, instance_type, timestamp)

  spot_bid_advisor
    fetched_at      timestamptz
    data            jsonb        -- the full blob stored as-is
    -- primary key: fetched_at  (one row per run)
"""

import os
from datetime import datetime, timezone

import requests

from fetch_spot import fetch_spot_price_history, fetch_bid_advisor

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",  # upsert semantics
}

BATCH = 500  # rows per POST to stay within Supabase payload limits


def _upsert(table: str, rows: list[dict]) -> None:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        resp = requests.post(url, json=chunk, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    print(f"  upserted {len(rows)} rows → {table}")


def run() -> None:
    ts = datetime.now(timezone.utc).isoformat()

    print("Fetching describe_spot_price_history …")
    history = fetch_spot_price_history(hours=24)
    _upsert("spot_price_history", history)

    print("Fetching spot-bid-advisor blob …")
    advisor = fetch_bid_advisor()
    _upsert("spot_bid_advisor", [{"fetched_at": ts, "data": advisor}])

    print("Done.")


if __name__ == "__main__":
    run()
