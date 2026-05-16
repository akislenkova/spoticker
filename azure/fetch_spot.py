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

# All spot VM prices across every region in one filter
SPOT_FILTER = "serviceName eq 'Virtual Machines' and contains(skuName, 'Spot')"

# Eviction rate per SKU per region — last 28 days of buckets
EVICTION_KQL = """
SpotResources
| where type =~ 'microsoft.compute/skuspotevictionrate'
| project
    location,
    skuName      = name,
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

    payload: dict = {
        "query": EVICTION_KQL,
        "options": {"$top": 1000},
    }
    if subscription_ids:
        payload["subscriptions"] = subscription_ids

    records: list[dict] = []
    skip_token: str | None = None

    while True:
        if skip_token:
            payload["options"]["$skipToken"] = skip_token

        resp = requests.post(GRAPH_URL, json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        body = resp.json()

        data = body.get("data", [])
        if isinstance(data, list):
            records.extend(data)
        else:
            cols = [c["name"] for c in data.get("columns", [])]
            for row in data.get("rows", []):
                records.append(dict(zip(cols, row)))

        skip_token = body.get("$skipToken")
        if not skip_token:
            break

    return records
