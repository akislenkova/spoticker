"""
Pulls Azure spot pricing + eviction rates and upserts into Supabase.

Environment variables:
  SUPABASE_URL              — https://xxxx.supabase.co
  SUPABASE_KEY              — service-role key
  AZURE_SUBSCRIPTION_IDS    — comma-separated sub IDs (optional; omit to query all)

Azure auth uses DefaultAzureCredential — works with env vars, managed identity,
az CLI login, VS Code login, etc. No extra config needed if you're logged in via
`az login`.
"""

import os
from datetime import datetime, timezone

import requests
from azure.identity import DefaultAzureCredential

from fetch_spot import fetch_retail_prices, fetch_eviction_rates

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
SUBSCRIPTION_IDS = [
    s.strip()
    for s in os.environ.get("AZURE_SUBSCRIPTION_IDS", "").split(",")
    if s.strip()
] or None

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
        resp = requests.post(url, json=chunk, headers=HEADERS, timeout=30)
        if not resp.ok:
            print(f"  ERROR {resp.status_code}: {resp.text[:500]}")
            resp.raise_for_status()
    print(f"  upserted {len(rows)} rows → {table}")


def _normalize_eviction(row: dict, fetched_at: str) -> dict | None:
    sku = (row.get("skuName") or row.get("sku_name") or "").strip()
    location = (row.get("location") or row.get("region") or "").strip()
    rate = (row.get("evictionRate") or row.get("spotEvictionRate") or "").strip()
    if not sku or not location or not rate:
        return None
    return {
        "fetched_at": fetched_at,
        "skuName": sku.lower(),
        "location": location.lower(),
        "evictionRate": rate,
    }


def _normalize_price(item: dict, fetched_at: str) -> dict:
    return {
        "fetched_at": fetched_at,
        "sku_name": item.get("skuName"),
        "arm_sku_name": item.get("armSkuName"),
        "region": item.get("armRegionName"),
        "location": item.get("location"),
        "retail_price": item.get("retailPrice"),
        "unit_price": item.get("unitPrice"),
        "currency_code": item.get("currencyCode"),
        "meter_name": item.get("meterName"),
        "product_name": item.get("productName"),
        "unit_of_measure": item.get("unitOfMeasure"),
        "effective_start_date": item.get("effectiveStartDate"),
    }


def run() -> None:
    ts = datetime.now(timezone.utc).isoformat()
    credential = DefaultAzureCredential()

    print("Fetching Azure Retail Prices (spot VMs) …")
    raw_prices = fetch_retail_prices()
    all_prices = [
        p for p in (_normalize_price(r, ts) for r in raw_prices)
        if p["sku_name"] and p["region"]
    ]
    # Deduplicate on (sku_name, region) — keep lowest retail_price
    deduped: dict[tuple, dict] = {}
    for p in all_prices:
        key = (p["sku_name"], p["region"])
        if key not in deduped or (p["retail_price"] or 0) < (deduped[key]["retail_price"] or 0):
            deduped[key] = p
    prices = list(deduped.values())
    print(f"  {len(prices)} rows after dedup (from {len(all_prices)})")
    _upsert("azure_spot_prices", prices)

    print("Fetching eviction rates from Resource Graph …")
    raw_eviction = fetch_eviction_rates(credential, subscription_ids=SUBSCRIPTION_IDS)
    eviction = [
        n for r in raw_eviction if (n := _normalize_eviction(r, ts)) is not None
    ]
    print(f"  {len(eviction)} rows after normalize (from {len(raw_eviction)})")
    _upsert("azure_spot_eviction_rates", eviction)

    print("Done.")


def run_eviction_only() -> None:
    ts = datetime.now(timezone.utc).isoformat()
    credential = DefaultAzureCredential()

    print("Fetching eviction rates from Resource Graph …")
    raw_eviction = fetch_eviction_rates(credential, subscription_ids=SUBSCRIPTION_IDS)
    eviction = [
        n for r in raw_eviction if (n := _normalize_eviction(r, ts)) is not None
    ]
    print(f"  {len(eviction)} rows after normalize (from {len(raw_eviction)})")
    _upsert("azure_spot_eviction_rates", eviction)
    print("Done.")


if __name__ == "__main__":
    import sys
    if "--eviction-only" in sys.argv:
        run_eviction_only()
    else:
        run()
