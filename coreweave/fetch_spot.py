"""
Scrape CoreWeave spot/preemptible prices from the public pricing page.

No API key — HTML is server-rendered (Webflow). Prices are listed per instance;
GPU rows are normalized to per-GPU/hr using the published GPU count.
"""

from __future__ import annotations

import re
from typing import Literal

import requests

PRICING_URL = "https://www.coreweave.com/pricing"

Region = Literal["us", "eu"]

# Normalized labels persisted in gpu_label (must match ui/lib/gpu-map.ts)
GPU_LABELS = (
    "H200",
    "H100",
    "A100 80GB",
    "A100 40GB",
    "V100",
    "L40S",
    "L4",
    "A10G",
    "T4",
    "CPU (AMD)",
    "CPU (Intel)",
    "CPU (ARM)",
)

_GPU_PATTERNS: list[tuple[re.Pattern[str], str]] = [
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

_CPU_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bAMD\b", re.I), "CPU (AMD)"),
    (re.compile(r"\bIntel\b", re.I), "CPU (Intel)"),
]

_ROW_RE = re.compile(
    r'<div role="listitem" class="table-row-v2[^"]*(kubernetes-gpu-pricing|kubernetes-cpu-pricing)">'
    r"(.*?)</div></div></div>",
    re.S,
)
_REGION_RE = re.compile(r"REGION:\s*([^<]+)", re.I)


def coreweave_gpu_label(model_name: str) -> str | None:
    for pattern, label in _GPU_PATTERNS:
        if pattern.search(model_name):
            return label
    return None


def coreweave_cpu_label(model_name: str) -> str | None:
    for pattern, label in _CPU_PATTERNS:
        if pattern.search(model_name):
            return label
    return None


def _norm_region(text: str) -> Region | None:
    t = text.strip().upper()
    if "NORTH AMERICA" in t:
        return "us"
    if "EUROPE" in t:
        return "eu"
    return None


def _parse_price(raw: str | None) -> float | None:
    if not raw:
        return None
    s = raw.strip()
    if not s or s.upper() == "N/A":
        return None
    m = re.search(r"\$?([\d,]+\.?\d*)", s)
    return float(m.group(1).replace(",", "")) if m else None


def _meta_value(block: str, label: str) -> str | None:
    m = re.search(
        rf'class="table-meta-value">([^<]+)</div>\s*<div>{re.escape(label)}</div>',
        block,
        re.S,
    )
    return m.group(1).strip() if m else None


def _parse_gpu_row(block: str, region: Region) -> dict | None:
    name_m = re.search(r'class="table-model-name">([^<]+)</h3>', block)
    slug_m = re.search(r'data-product="([^"]+)"', block)
    if not name_m or not slug_m:
        return None

    model_name = name_m.group(1).strip()
    label = coreweave_gpu_label(model_name)
    if not label or label not in GPU_LABELS or label.startswith("CPU"):
        return None

    spot_m = re.search(
        r'class="spot-price">Spot Price:\s*<span class="item-value">([^<]*)</span>',
        block,
    )
    ondemand_m = re.search(
        r'class="instance-price">On-Demand Price:\s*<span class="item-value">([^<]*)</span>',
        block,
    )
    spot_instance = _parse_price(spot_m.group(1) if spot_m else None)
    if spot_instance is None:
        return None

    gpu_count_raw = _meta_value(block, "GPU Count")
    gpu_count = int(re.sub(r"[^\d]", "", gpu_count_raw or "1") or "1")
    gpu_count = max(gpu_count, 1)

    on_demand_instance = _parse_price(ondemand_m.group(1) if ondemand_m else None)
    savings_pct = None
    if on_demand_instance and on_demand_instance > 0:
        savings_pct = round((1 - spot_instance / on_demand_instance) * 100, 1)

    return {
        "product_slug": slug_m.group(1),
        "region": region,
        "model_name": model_name,
        "gpu_label": label,
        "gpu_count": gpu_count,
        "spot_price_usd_per_gpu": spot_instance / gpu_count,
        "spot_price_usd_instance": spot_instance,
        "on_demand_price_usd": on_demand_instance,
        "spot_savings_pct": savings_pct,
    }


def _cell_values(block: str) -> list[str]:
    return [
        m.group(1).strip()
        for m in re.finditer(
            r'class="table-v2-cell(?:[^"]*)">\s*(?:<div>)?([^<]+)(?:</div>)?',
            block,
        )
    ]


def _parse_cpu_row(block: str, region: Region) -> dict | None:
    name_m = re.search(r'class="table-model-name">([^<]+)</h3>', block)
    slug_m = re.search(r'data-product="([^"]+)"', block)
    if not name_m or not slug_m:
        return None

    model_name = name_m.group(1).strip()
    label = coreweave_cpu_label(model_name)
    if not label:
        return None

    cells = _cell_values(block)
    # name, cpu-type, vcpus, ram, storage, on-demand, spot
    if len(cells) < 7:
        return None

    spot_instance = _parse_price(cells[6])
    if spot_instance is None:
        return None

    on_demand_instance = _parse_price(cells[5])
    savings_pct = None
    if on_demand_instance and on_demand_instance > 0:
        savings_pct = round((1 - spot_instance / on_demand_instance) * 100, 1)

    return {
        "product_slug": slug_m.group(1),
        "region": region,
        "model_name": model_name,
        "gpu_label": label,
        "gpu_count": 1,
        "spot_price_usd_per_gpu": spot_instance,
        "spot_price_usd_instance": spot_instance,
        "on_demand_price_usd": on_demand_instance,
        "spot_savings_pct": savings_pct,
    }


def fetch_spot_prices() -> list[dict]:
    resp = requests.get(
        PRICING_URL,
        headers={"User-Agent": "Spoticker/1.0 (+https://github.com/spoticker)"},
        timeout=120,
    )
    resp.raise_for_status()
    html = resp.text

    region_markers = [(m.start(), _norm_region(m.group(1))) for m in _REGION_RE.finditer(html)]
    region_markers = [(pos, r) for pos, r in region_markers if r is not None]
    if not region_markers:
        raise RuntimeError("CoreWeave pricing page: no REGION sections found")

    rows: list[dict] = []
    for i, (pos, region) in enumerate(region_markers):
        end = region_markers[i + 1][0] if i + 1 < len(region_markers) else len(html)
        chunk = html[pos:end]

        for kind, block in _ROW_RE.findall(chunk):
            parsed = (
                _parse_gpu_row(block, region)
                if kind == "kubernetes-gpu-pricing"
                else _parse_cpu_row(block, region)
            )
            if parsed:
                rows.append(parsed)

    return rows
