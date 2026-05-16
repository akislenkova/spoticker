"""
Fetches GCP spot/preemptible VM prices from the Cloud Billing Catalog API.
Prices are fixed and change at most once every 30 days.
"""

import google.auth
import google.auth.transport.requests
import requests

COMPUTE_SERVICE_ID = "6F81-5844-456A"
BILLING_URL = (
    f"https://cloudbilling.googleapis.com/v1/services/{COMPUTE_SERVICE_ID}/skus"
)
SPOT_USAGE_TYPES = {"Preemptible", "Spot"}


def _get_token() -> str:
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials.token


def _parse_price(pricing_info: list) -> float | None:
    """Converts units + nanos billing format to a float USD/hour."""
    if not pricing_info:
        return None
    rates = (
        pricing_info[0]
        .get("pricingExpression", {})
        .get("tieredRates", [])
    )
    if not rates:
        return None
    unit_price = rates[0].get("unitPrice", {})
    units = float(unit_price.get("units", 0) or 0)
    nanos = float(unit_price.get("nanos", 0) or 0)
    return units + nanos / 1e9


def fetch_spot_skus() -> list[dict]:
    """
    Returns all spot/preemptible Compute Engine SKUs with normalized pricing.
    Uses Application Default Credentials (`gcloud auth application-default login`).
    """
    token = _get_token()
    headers = {"Authorization": f"Bearer {token}"}
    params = {"currencyCode": "USD", "pageSize": 5000}

    records: list[dict] = []
    page_token: str | None = None

    while True:
        if page_token:
            params["pageToken"] = page_token

        resp = requests.get(BILLING_URL, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        body = resp.json()

        for sku in body.get("skus", []):
            category = sku.get("category", {})
            if category.get("usageType") not in SPOT_USAGE_TYPES:
                continue

            records.append({
                "sku_id": sku.get("skuId"),
                "description": sku.get("description"),
                "resource_family": category.get("resourceFamily"),
                "resource_group": category.get("resourceGroup"),
                "usage_type": category.get("usageType"),
                "regions": sku.get("serviceRegions", []),
                "price_usd_per_hour": _parse_price(sku.get("pricingInfo", [])),
                "effective_time": (
                    sku.get("pricingInfo", [{}])[0].get("effectiveTime")
                    if sku.get("pricingInfo") else None
                ),
            })

        page_token = body.get("nextPageToken")
        if not page_token:
            break

    return records
