import { awsGpu, azureGpu } from "./gpu-map";
import { supabase } from "./supabase";

export type WorkloadRequest = {
  prompt: string;
};

export type RecommendationOption = {
  cloud: "aws" | "azure";
  region: string;
  gpu: string;
  price: number;
  evictionLabel: string | null;
  riskTier: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  source: string;
  lastUpdated: string;
  details: string;
};

export type RecommendationResponse = {
  title: string;
  summary: string;
  reasoning: string;
  sources: string[];
  options: RecommendationOption[];
};

const GPU_KEYWORDS: Record<string, string> = {
  a100: "A100",
  h100: "H100",
  h200: "H200",
  l4: "L4",
  l40s: "L40S",
  t4: "T4",
  v100: "V100",
  a10: "A10",
};

function parseGpu(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const [keyword, label] of Object.entries(GPU_KEYWORDS)) {
    if (lower.includes(keyword)) return label;
  }
  return null;
}

function parseTolerance(prompt: string): "tolerant" | "sensitive" | "unknown" {
  const lower = prompt.toLowerCase();
  if (lower.includes("tolerat") || lower.includes("interruption") || lower.includes("checkpoint")) {
    return "tolerant";
  }
  if (lower.includes("can't tolerate") || lower.includes("cannot tolerate") || lower.includes("no eviction") || lower.includes("stateful") || lower.includes("real-time") || lower.includes("latency")) {
    return "sensitive";
  }
  return "unknown";
}

function parseWorkloadType(prompt: string): "batch" | "inference" | "training" | "unknown" {
  const lower = prompt.toLowerCase();
  if (lower.includes("batch")) return "batch";
  if (lower.includes("fine-tun") || lower.includes("training") || lower.includes("train")) return "training";
  if (lower.includes("infer") || lower.includes("real-time") || lower.includes("latency")) return "inference";
  return "unknown";
}

function riskTierFromColor(color: string): "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN" {
  if (color === "green") return "LOW";
  if (color === "yellow") return "MEDIUM";
  if (color === "red") return "HIGH";
  return "UNKNOWN";
}

function normalizeScore(value: number, min: number, max: number) {
  if (value <= min) return 0;
  if (value >= max) return 1;
  return (value - min) / (max - min);
}

export async function buildRecommendationResponse(
  prompt: string
): Promise<RecommendationResponse> {
  const workloadGpu = parseGpu(prompt);
  const tolerance = parseTolerance(prompt);
  const workloadType = parseWorkloadType(prompt);

  const [awsResult, azurePricesResult, azureEvictionsResult, telemetryResult] = await Promise.all([
    supabase.rpc("latest_aws_spot_prices"),
    supabase.rpc("latest_azure_spot_prices"),
    supabase.rpc("latest_azure_eviction_rates"),
    supabase.from("eviction_rates_30d").select("region, evictions_per_hour"),
  ]);

  const awsPrices = awsResult.data ?? [];
  const azurePrices = azurePricesResult.data ?? [];
  const azureEvictions = azureEvictionsResult.data ?? [];
  const telemetry = telemetryResult.data ?? [];

  const awsAdvisorRows = await supabase
    .from("spot_bid_advisor")
    .select("data")
    .order("fetched_at", { ascending: false })
    .limit(1);

  const advisorBlob = awsAdvisorRows.data?.[0]?.data?.spot_advisor ?? {};
  const awsRegionAdvisors = new Map<string, Record<string, { r: number }>>();
  for (const [region, values] of Object.entries(advisorBlob)) {
    awsRegionAdvisors.set(region, values as Record<string, { r: number }>);
  }

  const azureEvictionMap = new Map<string, { label: string; color: string }>();
  for (const row of azureEvictions) {
    azureEvictionMap.set(`${row.skuName}::${row.location}`, {
      label: row.evictionRate,
      color: row.evictionRate ? (row.evictionRate.includes("%") ? "yellow" : "gray") : "gray",
    });
  }
  const azureTelemetry = new Map<string, { label: string; color: string }>();
  for (const row of telemetry) {
    if (row.evictions_per_hour != null) {
      const daily = row.evictions_per_hour * 24 * 100;
      azureTelemetry.set(row.region, {
        label: `~${daily.toFixed(1)}%/day`,
        color: daily < 5 ? "green" : daily < 15 ? "yellow" : "red",
      });
    }
  }

  const options: RecommendationOption[] = [];

  for (const row of awsPrices) {
    const gpu = awsGpu(row.instance_type);
    if (!gpu) continue;
    if (workloadGpu && gpu !== workloadGpu) continue;
    const regionAdvisor = awsRegionAdvisors.get(row.region) ?? {};
    const entry = regionAdvisor[row.instance_type];
    const evictionLabel = entry != null ? `~${Math.round(entry.r * 100)}%` : null;
    const color = entry != null ? (entry.r < 0.05 ? "green" : entry.r < 0.15 ? "yellow" : "red") : "gray";
    options.push({
      cloud: "aws",
      region: row.region,
      gpu,
      price: row.price_usd,
      evictionLabel,
      riskTier: riskTierFromColor(color),
      source: `AWS spot ${row.instance_type}`,
      lastUpdated: row.fetched_at ?? row.updated_at ?? "unknown",
      details: `AWS ${row.instance_type} in ${row.region} at $${row.price_usd.toFixed(4)}/GPU with eviction ${evictionLabel ?? "unknown"}`,
    });
  }

  for (const row of azurePrices) {
    const gpu = azureGpu(row.arm_sku_name ?? row.sku_name ?? "");
    if (!gpu) continue;
    if (workloadGpu && gpu !== workloadGpu) continue;
    const ev = azureEvictionMap.get(`${row.arm_sku_name}::${row.region}`) ?? azureTelemetry.get(row.region) ?? { label: null, color: "gray" };
    options.push({
      cloud: "azure",
      region: row.region,
      gpu,
      price: row.retail_price,
      evictionLabel: ev.label,
      riskTier: riskTierFromColor(ev.color),
      source: `Azure spot ${row.arm_sku_name ?? row.sku_name}`,
      lastUpdated: row.fetched_at ?? row.updated_at ?? "unknown",
      details: `Azure ${row.arm_sku_name ?? row.sku_name} in ${row.region} at $${row.retail_price.toFixed(4)}/GPU with eviction ${ev.label ?? "unknown"}`,
    });
  }

  if (options.length === 0) {
    return {
      title: "No matching GPU options found",
      summary: "Spotticker could not find a matched GPU type for that request.",
      reasoning:
        workloadGpu
          ? `No live spot rows for ${workloadGpu} were available in AWS or Azure. Try a different GPU model or check the dataset.`
          : "No live spot rows are currently available for the requested workload.",
      sources: ["latest_aws_spot_prices", "latest_azure_spot_prices"],
      options: [],
    };
  }

  const prices = options.map((option) => option.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  const ranked = options
    .map((option) => {
      const priceScore = normalizeScore(option.price, minPrice, maxPrice);
      const riskScore = option.riskTier === "LOW" ? 0 : option.riskTier === "MEDIUM" ? 0.5 : option.riskTier === "HIGH" ? 1 : 0.5;
      const weight = tolerance === "sensitive" ? 0.6 : tolerance === "tolerant" ? 0.4 : 0.5;
      const score = weight * riskScore + (1 - weight) * priceScore;
      return { option, score };
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((item) => item.option);

  const primary = ranked[0];
  const recommendationTone = tolerance === "sensitive" ? "prioritize low eviction risk" : "balance price with risk";
  const summary = primary
    ? `Recommend ${primary.cloud.toUpperCase()} ${primary.region} for ${primary.gpu} with ${primary.riskTier.toLowerCase()} spot risk at $${primary.price.toFixed(4)}/GPU.`
    : "No strong recommendation available.";
  const reasoningLines = [
    `Parsed workload: ${workloadType === "unknown" ? "general GPU workload" : workloadType}.`,
    `Detected GPU: ${workloadGpu ?? "any supported GPU"}.`,
    `Tolerance: ${tolerance === "tolerant" ? "spot-friendly" : tolerance === "sensitive" ? "eviction-sensitive" : "unknown"}.`,
    `Selected by ${recommendationTone}.`,
    `Top choice: ${primary.cloud.toUpperCase()} ${primary.region} (${primary.gpu}) at $${primary.price.toFixed(4)}/GPU with ${primary.evictionLabel ?? "no eviction data"}.`,
    `Alternative options include ${ranked.slice(1).map((option) => `${option.cloud.toUpperCase()} ${option.region} (${option.gpu})`).join(", ") || "none"}.`,
  ];

  if (workloadType === "inference" || tolerance === "sensitive") {
    reasoningLines.push(
      "Spot is riskier for latency-sensitive or stateful workloads. If the workload cannot tolerate interruption, consider on-demand or a reserved fallback."
    );
  }

  return {
    title: `Spotticker recommendation for ${workloadGpu ?? "GPU workload"}`,
    summary,
    reasoning: reasoningLines.join(" "),
    sources: ["latest_aws_spot_prices", "latest_azure_spot_prices", "latest_azure_eviction_rates"],
    options: ranked,
  };
}
