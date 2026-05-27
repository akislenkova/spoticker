"""
Fetches GCP spot/preemptible VM prices and upserts into Supabase.
Upserts on sku_id — rows are overwritten when prices change.

Environment variables:
  SUPABASE_URL  — https://xxxx.supabase.co
  SUPABASE_KEY  — service-role key

GCP auth uses Application Default Credentials.
Run `gcloud auth application-default login` if not already set up.
"""

import os

import requests as http

from fetch_spot import fetch_spot_skus

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
        resp.raise_for_status()
    print(f"  upserted {len(rows)} rows → {table}")


def run() -> None:
    print("Fetching GCP spot/preemptible SKUs …")
    skus = fetch_spot_skus()
    _upsert("gcp_spot_prices", skus)
    print(f"Done. {len(skus)} SKUs fetched.")


if __name__ == "__main__":
    run()
