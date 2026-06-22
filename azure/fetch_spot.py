"""
Fetches Azure spot VM data from two sources:
  1. Azure Retail Prices API  — public, no auth, oData filters
  2. Azure Resource Graph     — requires Azure auth, KQL against SpotResources
"""

import time
import requests

RETAIL_URL = "https://prices.azure.com/api/retail/prices"
GRAPH_URL = (
    "https://management.azure.com/providers/Microsoft.ResourceGraph/resources"
    "?api-version=2021-03-01"
)

# All spot VM prices — Windows entries are filtered client-side (see scraper.py).
# Azure's oData API doesn't support `not contains()`.
SPOT_FILTER = "serviceName eq 'Virtual Machines' and contains(skuName, 'Spot')"

# On-demand retail prices for GPU SKUs only (targeted to keep response size small).
ONDEMAND_GPU_FILTER = (
    "serviceName eq 'Virtual Machines'"
    " and priceType eq 'Retail'"
    " and ("
    "contains(armSkuName, 'H200') or contains(armSkuName, 'H100')"
    " or contains(armSkuName, 'A100') or contains(armSkuName, 'V100')"
    " or contains(armSkuName, 'A10') or contains(armSkuName, 'L4')"
    " or contains(armSkuName, 'T4')"
    ")"
)

# Eviction rate per SKU per region — 28-day trailing buckets (tenant-level SpotResources)
# https://learn.microsoft.com/en-us/azure/virtual-machines/spot-vms#pricing-and-eviction-history
EVICTION_KQL = """
SpotResources
| where type =~ 'microsoft.compute/skuspotevictionrate/location'
| project
    location,
    skuName      = tostring(sku.name),
    evictionRate = tostring(properties.evictionRate)
"""


def fetch_retail_prices(odata_filter: str = SPOT_FILTER) -> list[dict]:
    """
    Pages through the Retail Prices API with an oData filter.
    Returns one dict per price entry (retailPrice, armSkuName, armRegionName, etc.).
    """
    params = {
        "api-version": "2023-01-01-preview",
        "$filter": odata_filter,
    }
    records: list[dict] = []
    url: str | None = RETAIL_URL

    while url:
        for attempt in range(5):
            resp = requests.get(
                url,
                params=params if url == RETAIL_URL else None,
                timeout=30,
            )
            if resp.status_code == 429:
                wait = int(resp.headers.get("Retry-After", 2 ** (attempt + 1)))
                print(f"  429 rate limit — waiting {wait}s (attempt {attempt + 1}/5)")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            break
        body = resp.json()
        records.extend(body.get("Items", []))
        url = body.get("NextPageLink")
        if url:
            time.sleep(0.3)

    return records


def fetch_ondemand_prices() -> list[dict]:
    """
    Fetch retail (non-spot) prices for GPU VM SKUs.
    Returns the same shape as fetch_retail_prices but scoped to GPU families only.
    Windows SKUs are not excluded here — filter client-side on armSkuName.
    """
    return fetch_retail_prices(odata_filter=ONDEMAND_GPU_FILTER)


def fetch_eviction_rates(
    credential,
    subscription_ids: list[str] | None = None,
) -> list[dict]:
    """
    Queries the Resource Graph SpotResources table for eviction rates.

    `credential` — any azure-identity credential, e.g. DefaultAzureCredential().
    `subscription_ids` — limit to specific subs; None queries all accessible ones.

    Paginates via $skipToken until exhausted.
    Returns list of {location, skuName, evictionRate} dicts.
    """
    token = credential.get_token("https://management.azure.com/.default").token
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    # Resource Graph requires explicit subscription IDs — auto-detect from CLI if not set
    if not subscription_ids:
        import subprocess, json as _json
        try:
            out = subprocess.check_output(["az", "account", "list", "--query", "[].id", "-o", "json"])
            subscription_ids = _json.loads(out)
            print(f"  using {len(subscription_ids)} subscription(s) from az CLI")
        except Exception as e:
            print(f"  WARNING: could not detect subscriptions: {e}")

    # SpotResources eviction rates are tenant-wide catalog data — omit subscriptions.
    payload: dict = {
        "query": EVICTION_KQL,
        "options": {"$top": 1000},
    }

    records: list[dict] = []
    skip_token: str | None = None
    page = 0

    while True:
        page += 1
        if skip_token:
            payload["options"]["$skipToken"] = skip_token

        resp = requests.post(GRAPH_URL, json=payload, headers=headers, timeout=60)
        if not resp.ok:
            print(f"  Resource Graph HTTP {resp.status_code}: {resp.text[:500]}")
        resp.raise_for_status()
        body = resp.json()

        total = body.get("totalRecords")
        if page == 1:
            print(f"  Resource Graph totalRecords={total}")

        data = body.get("data", [])
        page_rows: list[dict] = []
        if isinstance(data, list):
            page_rows = data
        elif data:
            cols = [c["name"] for c in data.get("columns", [])]
            for row in data.get("rows", []):
                page_rows.append(dict(zip(cols, row)))

        for row in page_rows:
            # Normalize alternate column names from samples/docs
            if "evictionRate" not in row and "spotEvictionRate" in row:
                row["evictionRate"] = row["spotEvictionRate"]
            if "skuName" not in row and "sku" in row:
                sku = row["sku"]
                if isinstance(sku, dict):
                    row["skuName"] = sku.get("name", "")

        records.extend(page_rows)
        print(f"  page {page}: {len(page_rows)} rows (running total {len(records)})")

        skip_token = body.get("$skipToken")
        if not skip_token:
            break

    if not records and subscription_ids:
        print(
            f"  NOTE: 0 rows at tenant scope "
            f"(subscription hint was set but unused for SpotResources)"
        )

    return records
