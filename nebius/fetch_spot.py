"""
Fetch Nebius preemptible GPU prices from the public Compute pricing docs.

Prices are published per GPU-hour on docs.nebius.com. Nebius also exposes a
billing calculator gRPC API (nebius.billing.v1alpha1.CalculatorService) for
live estimates when credentials are available; this scraper uses the docs page
so CI runs without Nebius account secrets.
"""

from __future__ import annotations

import re
from datetime import date

import requests

PRICING_URL = "https://docs.nebius.com/compute/resources/pricing"

# Normalized labels persisted in gpu_label (must match ui/lib/gpu-map.ts)
GPU_LABELS = (
    "B300",
    "B200",
    "H200",
    "H100",
    "A100 80GB",
    "A100 40GB",
    "V100",
    "L40S",
    "L4",
    "A10G",
    "T4",
)

_GPU_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bB300\b", re.I), "B300"),
    (re.compile(r"\bB200\b", re.I), "B200"),
    (re.compile(r"\bH200\b", re.I), "H200"),
    (re.compile(r"\bH100\b", re.I), "H100"),
    (re.compile(r"A100.*80\s*GB", re.I), "A100 80GB"),
    (re.compile(r"A100.*40\s*GB", re.I), "A100 40GB"),
    (re.compile(r"\bA100\b", re.I), "A100 80GB"),
    (re.compile(r"\bV100\b", re.I), "V100"),
    (re.compile(r"\bL40S\b", re.I), "L40S"),
    (re.compile(r"\bL40\b", re.I), "L40S"),
    (re.compile(r"\bL4\b", re.I), "L4"),
    (re.compile(r"\bA10\b", re.I), "A10G"),
    (re.compile(r"\bT4\b", re.I), "T4"),
]

_SECTION_RE = re.compile(
    r'<h4[^>]*id="(nvidia-[^"]+)"[^>]*>.*?(?=<h[34][^>]*id=|\Z)',
    re.S,
)
_REGION_RE = re.compile(r"<code>([a-z0-9-]+)</code>")
_ROW_RE = re.compile(
    r"<tr><td>([^<]+)</td><td data-numeric=\"true\">\$([^<]+)</td><td>([^<]+)</td></tr>"
)

# June 2026 price tier — docs publish both old and new rates during transition.
_JUNE_2026_TIER_START = date(2026, 6, 1)


def nebius_gpu_label(model_name: str) -> str | None:
    for pattern, label in _GPU_PATTERNS:
        if pattern.search(model_name):
            return label
    return None


def _platform_slug(section_id: str, model_name: str) -> str:
    if ", gpu-" in section_id or section_id.endswith("-sxm") or section_id.endswith("-sxm-a"):
        m = re.search(r"(gpu-[a-z0-9-]+)$", section_id)
        if m:
            return m.group(1)
    slug = re.sub(r"^nvidia-", "", section_id)
    slug = slug.replace("-nvlink", "")
    if not slug.startswith("gpu-"):
        slug = f"gpu-{slug}"
    return slug


def _section_model_name(section_id: str) -> str:
    core = section_id.removeprefix("nvidia-").replace("-", " ")
    core = re.sub(r"\bgpu\b", "GPU", core, flags=re.I)
    core = re.sub(r"\bsxm\b", "SXM", core, flags=re.I)
    return core.title()


def _parse_price(raw: str) -> float:
    return float(raw.replace(",", "").strip())


def _gpu_prices_from_chunk(chunk: str) -> tuple[float | None, float | None]:
    """Return (on_demand_per_gpu, preemptible_per_gpu) from a USD table section."""
    use_june_2026 = date.today() >= _JUNE_2026_TIER_START
    if use_june_2026 and "Item — from June 1, 2026" in chunk:
        start = chunk.find("Item — from June 1, 2026")
        end = chunk.find("Item — before June 1, 2026", start)
        chunk = chunk[start:end if end > start else None]

    on_demand: float | None = None
    preemptible: float | None = None

    for name, price_raw, per in _ROW_RE.findall(chunk):
        if per.strip() != "1 GPU hour":
            continue
        price = _parse_price(price_raw)
        if name.lower().startswith("preemptible"):
            if preemptible is None:
                preemptible = price
        elif on_demand is None:
            on_demand = price

    return on_demand, preemptible


def fetch_spot_prices() -> list[dict]:
    resp = requests.get(
        PRICING_URL,
        headers={"User-Agent": "Spoticker/1.0 (+https://github.com/spoticker)"},
        timeout=120,
    )
    resp.raise_for_status()
    html = resp.text

    section_matches = list(_SECTION_RE.finditer(html))
    if not section_matches:
        raise RuntimeError("Nebius pricing page: no GPU sections found")

    rows: list[dict] = []

    for m in section_matches:
        section_id = m.group(1)
        chunk = m.group(0)

        regions = _REGION_RE.findall(chunk)
        if not regions:
            continue

        on_demand, preemptible = _gpu_prices_from_chunk(chunk)
        if preemptible is None:
            continue

        # Derive a display name from the first on-demand row when possible.
        model_name = None
        for name, _, per in _ROW_RE.findall(chunk):
            if per.strip() == "1 GPU hour" and not name.lower().startswith("preemptible"):
                model_name = name.strip()
                break
        if not model_name:
            model_name = _section_model_name(section_id)

        gpu_label = nebius_gpu_label(model_name)
        if not gpu_label or gpu_label not in GPU_LABELS:
            continue

        platform_slug = _platform_slug(section_id, model_name)
        savings_pct = None
        if on_demand and on_demand > 0:
            savings_pct = round((1 - preemptible / on_demand) * 100, 1)

        for region in dict.fromkeys(regions):
            rows.append(
                {
                    "platform_slug": platform_slug,
                    "region": region,
                    "model_name": model_name,
                    "gpu_label": gpu_label,
                    "gpu_count": 1,
                    "spot_price_usd_per_gpu": preemptible,
                    "on_demand_price_usd": on_demand,
                    "spot_savings_pct": savings_pct,
                }
            )

    if not rows:
        raise RuntimeError("Nebius pricing page: parsed zero preemptible GPU rows")

    return rows
