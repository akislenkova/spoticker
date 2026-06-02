import { supabase } from "./supabase";
import {
  GPU_ORDER,
  GpuLabel,
  CellColor,
  awsGpu,
  gcpGpu,
  runpodGpu,
  vastGpu,
  coreweaveGpu,
  nebiusGpu,
  vastReliabilityLabel,
  vastReliabilityColor,
  azureEvictionKey,
  awsRangeLabel,
  awsRangeColor,
  evictionColor,
  RUNPOD_INTERRUPT_LABEL,
  COREWEAVE_SPOT_LABEL,
  NEBIUS_PREEMPTIBLE_LABEL,
} from "./gpu-map";
import {
  awsEc2LaunchUrl,
  azureVmCreateUrl,
  gcpVmCreateUrl,
  runpodSpotDeployUrl,
  vastOfferSearchUrl,
  coreweavePricingUrl,
  nebiusVmCreateUrl,
} from "./cloud-links";

export type CellData = {
  price: number | null;
  evictionLabel: string | null;
  color: CellColor;
  href?: string;
  instanceLabel?: string;
};

export type MatrixColumn = {
  cloud: "aws" | "azure" | "gcp" | "runpod" | "vast" | "coreweave" | "nebius";
  region: string;
  key: string;
};

export type MatrixRow = {
  gpu: GpuLabel;
  cells: Record<string, CellData>;
};

export type DataFreshness = {
  awsPricesAt: string | null;
  awsAdvisorAt: string | null;
  azurePricesAt: string | null;
  azureEvictionAt: string | null;
  gcpPricesAt: string | null;
  runpodPricesAt: string | null;
  vastPricesAt: string | null;
  coreweavePricesAt: string | null;
  nebiusPricesAt: string | null;
};

export type MatrixData = {
  columns: MatrixColumn[];
  rows: MatrixRow[];
  freshness: DataFreshness;
};

type CellEntry = {
  price: number;
  evictionLabel: string | null;
  color: CellColor;
  instanceLabel: string;
  href: string;
};

// ── AWS GPU count normalization ───────────────────────────────────────────────
// AWS spot prices are per-instance/hr; GCP prices are per-GPU/hr.  Divide by
// GPU count so all three clouds show a comparable per-GPU/hr figure.
// CPU instance types all have count 1, so they are unaffected.
const AWS_INSTANCE_GPU_COUNT: Record<string, number> = {
  // H200 (p5e)
  "p5e.48xlarge": 8,
  // H100 (p5)
  "p5.48xlarge": 8,
  // A100 80GB (p4de)
  "p4de.24xlarge": 8,
  // A100 40GB (p4d)
  "p4d.24xlarge": 8,
  // V100 (p3)
  "p3.2xlarge": 1, "p3.8xlarge": 4, "p3.16xlarge": 8, "p3dn.24xlarge": 8,
  // L40S (g6e)
  "g6e.xlarge": 1, "g6e.2xlarge": 1, "g6e.4xlarge": 1, "g6e.8xlarge": 1,
  "g6e.12xlarge": 4, "g6e.48xlarge": 8,
  // L4 (g6)
  "g6.xlarge": 1, "g6.2xlarge": 1, "g6.4xlarge": 1, "g6.8xlarge": 1,
  "g6.12xlarge": 4, "g6.16xlarge": 1, "g6.24xlarge": 4, "g6.48xlarge": 8,
  // A10G (g5)
  "g5.xlarge": 1, "g5.2xlarge": 1, "g5.4xlarge": 1, "g5.8xlarge": 1,
  "g5.12xlarge": 4, "g5.16xlarge": 1, "g5.24xlarge": 4, "g5.48xlarge": 8,
  // T4 (g4dn)
  "g4dn.xlarge": 1, "g4dn.2xlarge": 1, "g4dn.4xlarge": 1, "g4dn.8xlarge": 1,
  "g4dn.12xlarge": 4, "g4dn.16xlarge": 1, "g4dn.metal": 8,
};
function awsGpuCount(instanceType: string): number {
  return AWS_INSTANCE_GPU_COUNT[instanceType] ?? 1;
}

// ── AWS ──────────────────────────────────────────────────────────────────────

async function fetchAws(): Promise<Map<string, CellEntry>> {
  const { data: prices, error: pricesErr } = await supabase.rpc("latest_aws_spot_prices");
  if (pricesErr) console.error("[aws] latest_aws_spot_prices:", pricesErr.message);

  const { data: advisorRows, error: advisorErr } = await supabase
    .from("spot_bid_advisor")
    .select("data")
    .order("fetched_at", { ascending: false })
    .limit(1);
  if (advisorErr) console.error("[aws] spot_bid_advisor:", advisorErr.message);

  const advisorBlob = advisorRows?.[0]?.data?.spot_advisor ?? {};

  const map = new Map<string, CellEntry>();

  for (const row of prices ?? []) {
    const gpu = awsGpu(row.instance_type);
    if (!gpu) continue;

    const regionAdvisor = advisorBlob[row.region]?.["Linux"] ?? {};
    const entry = regionAdvisor[row.instance_type];
    const evictionLabel = entry != null ? awsRangeLabel(entry.r) : null;
    const color = entry != null ? awsRangeColor(entry.r) : "gray";

    const gpuCount = awsGpuCount(row.instance_type);
    const pricePerGpu = row.price_usd / gpuCount;

    const key = `${gpu}::aws:${row.region}`;
    const existing = map.get(key);
    if (!existing || pricePerGpu < existing.price) {
      map.set(key, {
        price: pricePerGpu,
        evictionLabel,
        color,
        instanceLabel: row.instance_type,
        href: awsEc2LaunchUrl(row.region, row.instance_type),
      });
    }
  }

  return map;
}

// ── Azure ─────────────────────────────────────────────────────────────────────

function telemetryColor(evictionsPerHour: number): CellColor {
  const daily = evictionsPerHour * 24;
  if (daily < 0.05) return "green";
  if (daily < 0.15) return "yellow";
  return "red";
}

function telemetryLabel(evictionsPerHour: number): string {
  const daily = evictionsPerHour * 24 * 100;
  return `~${daily.toFixed(1)}%/day`;
}

type AzureAggRow = {
  gpu_label: GpuLabel;
  region: string;
  arm_sku_name: string;
  retail_price: number;
};

/** Fetch only the latest-batch eviction rows (avoids the PostgREST 1000-row hard cap). */
async function fetchAzureEvictionLatestBatch(): Promise<
  { skuName: string; location: string; evictionRate: string }[]
> {
  const { data: head } = await supabase
    .from("azure_spot_eviction_rates")
    .select("fetched_at")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!head?.fetched_at) return [];

  const { data, error } = await supabase
    .from("azure_spot_eviction_rates")
    .select("skuName, location, evictionRate")
    .eq("fetched_at", head.fetched_at)
    // GPU SKUs only — CPU patterns like %as_v5% or %ds_v5% match thousands of rows
    // and blow past PostgREST's 1000-row hard cap. CPU types fall back to telMap.
    .or(
      [
        "skuName.ilike.%t4%",
        "skuName.ilike.%a10%",
        "skuName.ilike.%l4%",
        "skuName.ilike.%l40s%",
        "skuName.ilike.%v100%",
        "skuName.ilike.%a100%",
        "skuName.ilike.%h100%",
        "skuName.ilike.%h200%",
        "skuName.ilike.%b200%",
        "skuName.ilike.%b300%",
      ].join(",")
    );

  if (error) {
    console.error("[azure] azure_spot_eviction_rates latest batch:", error.message);
    return [];
  }
  return (data ?? []) as { skuName: string; location: string; evictionRate: string }[];
}

async function fetchAzure(): Promise<Map<string, CellEntry>> {
  const [{ data: priceRows, error: priceErr }, evictionRows, { data: telemetry, error: telErr }] =
    await Promise.all([
      supabase.rpc("latest_azure_spot_prices_agg"),
      fetchAzureEvictionLatestBatch(),
      supabase.from("eviction_rates_30d").select("region, evictions_per_hour"),
    ]);

  if (priceErr) console.error("[azure] latest_azure_spot_prices_agg:", priceErr.message);
  if (telErr) console.error("[azure] eviction_rates_30d:", telErr.message);

  const rgMap = new Map<string, { label: string; color: CellColor }>();
  for (const e of evictionRows) {
    if (!e.skuName || !e.location) continue;
    const key = azureEvictionKey(e.skuName, e.location);
    if (rgMap.has(key)) continue;
    rgMap.set(key, {
      label: e.evictionRate,
      color: evictionColor(e.evictionRate),
    });
  }

  const telMap = new Map<string, { label: string; color: CellColor }>();
  for (const t of telemetry ?? []) {
    if (t.evictions_per_hour != null && t.region) {
      telMap.set(t.region.toLowerCase(), {
        label: telemetryLabel(t.evictions_per_hour),
        color: telemetryColor(t.evictions_per_hour),
      });
    }
  }

  const map = new Map<string, CellEntry>();

  for (const row of (priceRows ?? []) as AzureAggRow[]) {
    const ev =
      rgMap.get(azureEvictionKey(row.arm_sku_name, row.region)) ??
      telMap.get(row.region.toLowerCase()) ??
      null;

    const key = `${row.gpu_label}::azure:${row.region}`;
    const existing = map.get(key);
    if (!existing || row.retail_price < existing.price) {
      map.set(key, {
        price: row.retail_price,
        evictionLabel: ev?.label ?? null,
        color: ev?.color ?? "gray",
        instanceLabel: row.arm_sku_name,
        href: azureVmCreateUrl(row.region),
      });
    }
  }

  return map;
}

// ── GCP ───────────────────────────────────────────────────────────────────────

const GCP_GPU_FILTER = [
  "description.ilike.%T4%",
  "description.ilike.%A10%",
  "description.ilike.%L4%",
  "description.ilike.%L40S%",
  "description.ilike.%V100%",
  "description.ilike.%A100%",
  "description.ilike.%H100%",
  "description.ilike.%H200%",
  "description.ilike.%B200%",
  "description.ilike.%B300%",
  // CPU types — GCP billing catalog description prefixes
  "description.ilike.%N2D%",
  "description.ilike.%C2D%",
  "description.ilike.%T2A%",
  "description.ilike.%N2 %",
  "description.ilike.%C2 %",
  "description.ilike.%C3 %",
].join(",");

async function fetchGcp(): Promise<Map<string, CellEntry>> {
  const { data, error } = await supabase
    .from("gcp_spot_prices")
    .select("description, regions, price_usd_per_hour")
    .or(GCP_GPU_FILTER);

  if (error) console.error("[gcp] gcp_spot_prices:", error.message);

  const map = new Map<string, CellEntry>();

  for (const row of data ?? []) {
    const gpu = gcpGpu(row.description ?? "");
    if (!gpu || row.price_usd_per_hour == null) continue;

    const rawRegions = typeof row.regions === "string" ? JSON.parse(row.regions) : row.regions;
    const regions: string[] = Array.isArray(rawRegions) ? rawRegions : [];

    for (const region of regions) {
      const key = `${gpu}::gcp:${region}`;
      const existing = map.get(key);
      if (!existing || Number(row.price_usd_per_hour) < existing.price) {
        map.set(key, {
          price: Number(row.price_usd_per_hour),
          evictionLabel: null,
          color: "gray",
          instanceLabel: row.description ?? "",
          href: gcpVmCreateUrl(region),
        });
      }
    }
  }

  return map;
}

// ── RunPod ───────────────────────────────────────────────────────────────────

async function fetchRunpod(): Promise<Map<string, CellEntry>> {
  const { data, error } = await supabase
    .from("runpod_spot_prices")
    .select("gpu_type_id, cloud_tier, display_name, spot_price_usd_per_gpu, stock_status");

  if (error) console.error("[runpod] runpod_spot_prices:", error.message);

  const map = new Map<string, CellEntry>();

  for (const row of data ?? []) {
    const gpu = runpodGpu(row.gpu_type_id ?? "");
    if (!gpu || row.spot_price_usd_per_gpu == null) continue;

    const tier = row.cloud_tier as "community" | "secure";
    if (tier !== "community" && tier !== "secure") continue;

    const key = `${gpu}::runpod:${tier}`;
    const price = Number(row.spot_price_usd_per_gpu);
    const existing = map.get(key);
    if (!existing || price < existing.price) {
      map.set(key, {
        price,
        evictionLabel: RUNPOD_INTERRUPT_LABEL,
        color: "gray",
        instanceLabel: row.display_name ?? row.gpu_type_id,
        href: runpodSpotDeployUrl(tier),
      });
    }
  }

  return map;
}

// ── Vast.ai ──────────────────────────────────────────────────────────────────

async function fetchVast(): Promise<Map<string, CellEntry>> {
  const { data, error } = await supabase
    .from("vast_spot_prices")
    .select("gpu_label, gpu_name, cloud_tier, display_name, spot_price_usd_per_gpu, reliability");

  if (error) console.error("[vast] vast_spot_prices:", error.message);

  const map = new Map<string, CellEntry>();

  for (const row of data ?? []) {
    const gpu =
      (row.gpu_label as GpuLabel | null) ??
      vastGpu(row.gpu_name ?? row.display_name ?? "");
    if (!gpu || row.spot_price_usd_per_gpu == null) continue;

    const tier = row.cloud_tier as "community" | "secure";
    if (tier !== "community" && tier !== "secure") continue;

    const reliability = row.reliability != null ? Number(row.reliability) : null;
    const evictionLabel =
      reliability != null ? vastReliabilityLabel(reliability) : null;
    const color =
      reliability != null ? vastReliabilityColor(reliability) : "gray";

    const key = `${gpu}::vast:${tier}`;
    const price = Number(row.spot_price_usd_per_gpu);
    const gpuName = row.gpu_name ?? row.display_name ?? gpu;
    const existing = map.get(key);
    if (!existing || price < existing.price) {
      map.set(key, {
        price,
        evictionLabel,
        color,
        instanceLabel: row.display_name ?? gpuName,
        href: vastOfferSearchUrl(gpuName, tier),
      });
    }
  }

  return map;
}

// ── CoreWeave ────────────────────────────────────────────────────────────────

async function fetchCoreweave(): Promise<Map<string, CellEntry>> {
  const { data, error } = await supabase
    .from("coreweave_spot_prices")
    .select(
      "product_slug, region, model_name, gpu_label, gpu_count, spot_price_usd_per_gpu, spot_savings_pct"
    );

  if (error) console.error("[coreweave] coreweave_spot_prices:", error.message);

  const map = new Map<string, CellEntry>();

  for (const row of data ?? []) {
    const gpu =
      (row.gpu_label as GpuLabel | null) ??
      coreweaveGpu(row.model_name ?? "");
    if (!gpu || row.spot_price_usd_per_gpu == null) continue;

    const region = row.region as string;
    if (region !== "us" && region !== "eu") continue;

    const savings =
      row.spot_savings_pct != null ? Number(row.spot_savings_pct) : null;
    const evictionLabel =
      savings != null
        ? `${COREWEAVE_SPOT_LABEL} · ~${savings.toFixed(0)}% off`
        : COREWEAVE_SPOT_LABEL;

    const key = `${gpu}::coreweave:${region}`;
    const price = Number(row.spot_price_usd_per_gpu);
    const existing = map.get(key);
    if (!existing || price < existing.price) {
      map.set(key, {
        price,
        evictionLabel,
        color: "gray",
        instanceLabel: row.model_name ?? row.product_slug,
        href: coreweavePricingUrl(),
      });
    }
  }

  return map;
}

// ── Nebius ───────────────────────────────────────────────────────────────────

async function fetchNebius(): Promise<Map<string, CellEntry>> {
  const { data, error } = await supabase
    .from("nebius_spot_prices")
    .select(
      "platform_slug, region, model_name, gpu_label, spot_price_usd_per_gpu, spot_savings_pct"
    );

  if (error) console.error("[nebius] nebius_spot_prices:", error.message);

  const map = new Map<string, CellEntry>();

  for (const row of data ?? []) {
    const gpu =
      (row.gpu_label as GpuLabel | null) ??
      nebiusGpu(row.model_name ?? "");
    if (!gpu || row.spot_price_usd_per_gpu == null) continue;

    const region = row.region as string;
    const savings =
      row.spot_savings_pct != null ? Number(row.spot_savings_pct) : null;
    const evictionLabel =
      savings != null
        ? `${NEBIUS_PREEMPTIBLE_LABEL} · ~${savings.toFixed(0)}% off`
        : NEBIUS_PREEMPTIBLE_LABEL;

    const key = `${gpu}::nebius:${region}`;
    const price = Number(row.spot_price_usd_per_gpu);
    const existing = map.get(key);
    if (!existing || price < existing.price) {
      map.set(key, {
        price,
        evictionLabel,
        color: "gray",
        instanceLabel: row.model_name ?? row.platform_slug,
        href: nebiusVmCreateUrl(),
      });
    }
  }

  return map;
}

// ── Scrape timestamps ─────────────────────────────────────────────────────────

async function fetchFreshness(): Promise<DataFreshness> {
  const [awsPrice, awsAdvisor, azurePrice, azureEviction, gcpPrice, runpodPrice, vastPrice, coreweavePrice, nebiusPrice] =
    await Promise.all([
    supabase
      .from("spot_price_history")
      .select("timestamp")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("spot_bid_advisor")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("azure_spot_prices")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("azure_spot_eviction_rates")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("gcp_spot_prices")
      .select("effective_time")
      .order("effective_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("runpod_spot_prices")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("vast_spot_prices")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("coreweave_spot_prices")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("nebius_spot_prices")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    awsPricesAt: awsPrice.data?.timestamp ?? null,
    awsAdvisorAt: awsAdvisor.data?.fetched_at ?? null,
    azurePricesAt: azurePrice.data?.fetched_at ?? null,
    azureEvictionAt: azureEviction.data?.fetched_at ?? null,
    gcpPricesAt: gcpPrice.data?.effective_time ?? null,
    runpodPricesAt: runpodPrice.data?.fetched_at ?? null,
    vastPricesAt: vastPrice.data?.fetched_at ?? null,
    coreweavePricesAt: coreweavePrice.data?.fetched_at ?? null,
    nebiusPricesAt: nebiusPrice.data?.fetched_at ?? null,
  };
}

// ── Matrix assembly ───────────────────────────────────────────────────────────

const DEV_CACHE_MS = 120_000;
let devMatrixCache: { data: MatrixData; at: number } | null = null;

async function buildMatrixInner(): Promise<MatrixData> {
  const [awsMap, azureMap, gcpMap, runpodMap, vastMap, coreweaveMap, nebiusMap, freshness] = await Promise.all([
    fetchAws(),
    fetchAzure(),
    fetchGcp(),
    fetchRunpod(),
    fetchVast(),
    fetchCoreweave(),
    fetchNebius(),
    fetchFreshness(),
  ]);

  const columnSet = new Set<string>();
  for (const key of [
    ...awsMap.keys(),
    ...azureMap.keys(),
    ...gcpMap.keys(),
    ...runpodMap.keys(),
    ...vastMap.keys(),
    ...coreweaveMap.keys(),
    ...nebiusMap.keys(),
  ]) {
    columnSet.add(key.split("::")[1]);
  }

  const columns: MatrixColumn[] = [...columnSet]
    .sort((a, b) => {
      const [ca, ra] = a.split(":");
      const [cb, rb] = b.split(":");
      const cloudOrder = { aws: 0, azure: 1, gcp: 2, runpod: 3, vast: 4, coreweave: 5, nebius: 6 } as Record<string, number>;
      return (cloudOrder[ca] ?? 9) - (cloudOrder[cb] ?? 9) || ra.localeCompare(rb);
    })
    .map((cr) => {
      const idx = cr.indexOf(":");
      const cloud = cr.slice(0, idx) as MatrixColumn["cloud"];
      const region = cr.slice(idx + 1);
      return { cloud, region, key: cr };
    });

  const allData = new Map([...awsMap, ...azureMap, ...gcpMap, ...runpodMap, ...vastMap, ...coreweaveMap, ...nebiusMap]);

  const rows: MatrixRow[] = GPU_ORDER.map((gpu) => ({
    gpu,
    cells: Object.fromEntries(
      columns.map(({ key }) => {
        const d = allData.get(`${gpu}::${key}`);
        return [
          key,
          d
            ? {
                price: d.price,
                evictionLabel: d.evictionLabel,
                color: d.color,
                href: d.href,
                instanceLabel: d.instanceLabel,
              }
            : { price: null, evictionLabel: null, color: "gray" as CellColor },
        ];
      })
    ),
  }));

  return { columns, rows, freshness };
}

export async function buildMatrix(): Promise<MatrixData> {
  if (process.env.NODE_ENV === "development") {
    const now = Date.now();
    if (devMatrixCache && now - devMatrixCache.at < DEV_CACHE_MS) {
      return devMatrixCache.data;
    }
    const data = await buildMatrixInner();
    devMatrixCache = { data, at: now };
    return data;
  }
  return buildMatrixInner();
}
