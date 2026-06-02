import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import {
  awsGpu,
  azureGpu,
  gcpGpu,
  runpodGpu,
  GpuLabel,
  vastGpu,
  vastReliabilityLabel,
  vastReliabilityColor,
  azureEvictionKey,
  awsRangeLabel,
  awsRangeColor,
  evictionColor,
  RUNPOD_INTERRUPT_LABEL,
} from "./gpu-map";

export type RecommendationOption = {
  cloud: string;
  region: string;
  gpu: string;
  price: number;
  evictionLabel: string | null;
  riskTier: string;
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

const WORKLOAD_NOTES: Record<string, [string, string]> = {
  T4:               ["batch jobs, smaller fine-tunes, cost-sensitive inference",
                     "real-time inference without checkpointing, large model training"],
  A10G:             ["batch inference, mid-size fine-tunes, A10G-optimised workloads",
                     "stateful training without checkpointing"],
  L4:               ["transformer inference, batch jobs, cost-sensitive fine-tuning",
                     "real-time latency-sensitive serving"],
  L40S:             ["mid-size training, graphics/rendering workloads, FP8 inference",
                     "stateful training without checkpointing"],
  V100:             ["batch training, legacy model fine-tuning",
                     "new workloads (A100 is cheaper and faster), real-time inference"],
  "A100 40GB":      ["large model training, fine-tuning, high-throughput batch inference",
                     "real-time inference, stateful training without checkpointing"],
  "A100 80GB":      ["very large model training requiring >40 GB VRAM, MoE fine-tuning",
                     "real-time inference, stateful training without checkpointing"],
  H100:             ["frontier model training, maximum throughput batch inference",
                     "cost-sensitive workloads, real-time serving where A100 suffices"],
  H200:             ["cutting-edge frontier training, HBM3e memory-bound workloads",
                     "cost-sensitive use cases — use H100 or A100 instead"],
  "CPU (AMD)":      ["CPU-bound batch jobs, data preprocessing, general-purpose compute",
                     "GPU-accelerated training or inference"],
  "CPU (Intel)":    ["CPU-bound batch jobs, data preprocessing, general-purpose compute",
                     "GPU-accelerated training or inference"],
  "CPU (ARM)": ["cost-optimised CPU workloads, Arm-native software, CI/CD",
                     "x86-only software, GPU-accelerated workloads"],
};

const GPU_COUNTS: Record<string, number> = {
  // T4 (g4dn)
  "g4dn.xlarge": 1, "g4dn.2xlarge": 1, "g4dn.4xlarge": 1,
  "g4dn.8xlarge": 1, "g4dn.12xlarge": 4, "g4dn.16xlarge": 1, "g4dn.metal": 8,
  // A10G (g5)
  "g5.xlarge": 1, "g5.2xlarge": 1, "g5.4xlarge": 1, "g5.8xlarge": 1,
  "g5.12xlarge": 4, "g5.16xlarge": 1, "g5.24xlarge": 4, "g5.48xlarge": 8,
  // L4 (g6)
  "g6.xlarge": 1, "g6.2xlarge": 1, "g6.4xlarge": 1, "g6.8xlarge": 1,
  "g6.12xlarge": 4, "g6.16xlarge": 1, "g6.24xlarge": 4, "g6.48xlarge": 8,
  // L40S (g6e)
  "g6e.xlarge": 1, "g6e.2xlarge": 1, "g6e.4xlarge": 1, "g6e.8xlarge": 1,
  "g6e.12xlarge": 4, "g6e.48xlarge": 8,
  // V100 (p3)
  "p3.2xlarge": 1, "p3.8xlarge": 4, "p3.16xlarge": 8, "p3dn.24xlarge": 8,
  // A100 40GB (p4d)
  "p4d.24xlarge": 8,
  // A100 80GB (p4de)
  "p4de.24xlarge": 8,
  // H100 (p5)
  "p5.48xlarge": 8,
  // H200 (p5e)
  "p5e.48xlarge": 8,
  // CPU instances (1 = N/A GPUs, used only for context)
  "m7a.xlarge": 1, "m7a.2xlarge": 1, "m7a.4xlarge": 1,
  "c7a.xlarge": 1, "c7a.2xlarge": 1, "c7a.4xlarge": 1,
  "m7i.xlarge": 1, "m7i.2xlarge": 1, "m7i.4xlarge": 1,
  "c7i.xlarge": 1, "c7i.2xlarge": 1, "c7i.4xlarge": 1,
  "m7g.xlarge": 1, "m7g.2xlarge": 1, "m7g.4xlarge": 1,
  "c7g.xlarge": 1, "c7g.2xlarge": 1, "c7g.4xlarge": 1,
};

const RISK_TIER: Record<string, string> = {
  green: "LOW", yellow: "MEDIUM", red: "HIGH", gray: "UNKNOWN",
};

const SYSTEM_PROMPT = `You are Spoticker's recommendation engine. You have live spot pricing data from the Spoticker catalog.

Given a workload description and a set of live pricing pages, return a specific, opinionated recommendation like a senior infra engineer would give.

Rules:
- NEVER recommend spot for real-time inference, stateful services, or latency-sensitive workloads — say so explicitly
- For batch training / fine-tuning that tolerates eviction: optimise cost × risk together, not just cheapest price
- Be opinionated: pick one winner, explain why, acknowledge the tradeoff
- Cite actual prices and eviction rates from the data — do not hallucinate numbers
- If the workload is risky on spot, warn and suggest on-demand or reserved as fallback
- If no exact match exists in the data, recommend the closest available option and note the gap
- GCP prices are per-GPU/hour (accelerator only); total VM cost will be higher — note this when recommending GCP

Return ONLY a valid JSON object — no markdown wrapper, no text outside the JSON:
{
  "title": "short recommendation title (1 line)",
  "summary": "bottom line in 1-2 sentences",
  "reasoning": "2-3 sentence explanation as a senior infra engineer",
  "sources": ["source-description-1", "source-description-2"],
  "options": [
    {
      "cloud": "aws",
      "region": "us-east-1",
      "gpu": "A100",
      "price": 14.20,
      "evictionLabel": "<5%",
      "riskTier": "LOW",
      "source": "AWS p4d.24xlarge us-east-1",
      "lastUpdated": "2026-05-16T19:13:58Z",
      "details": "one-line detail"
    }
  ]
}

options should be ranked best-first. Include 1–3 options. options may be empty if no data is available.`;

async function buildPricingContext(): Promise<{ context: string; timestamp: string }> {
  const now = new Date().toISOString();

  const [
    awsPricesResult,
    advisorResult,
    azurePricesResult,
    azureEvictionsResult,
    gcpPricesResult,
    runpodPricesResult,
    vastPricesResult,
  ] = await Promise.all([
      supabase.rpc("latest_aws_spot_prices"),
      supabase.from("spot_bid_advisor").select("data").order("fetched_at", { ascending: false }).limit(1),
      supabase.rpc("latest_azure_spot_prices"),
      supabase
        .from("azure_spot_eviction_rates")
        .select("skuName, location, evictionRate, fetched_at")
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
            "skuName.ilike.%as_v4%",
            "skuName.ilike.%as_v5%",
            "skuName.ilike.%ps_v4%",
            "skuName.ilike.%ps_v5%",
            "skuName.ilike.%ds_v5%",
          ].join(",")
        )
        .order("fetched_at", { ascending: false })
        .limit(2000),
      supabase
        .from("gcp_spot_prices")
        .select("description, regions, price_usd_per_hour")
        .or(
          [
            "description.ilike.%T4%",
            "description.ilike.%A10%",
            "description.ilike.%L4%",
            "description.ilike.%L40S%",
            "description.ilike.%V100%",
            "description.ilike.%A100%",
            "description.ilike.%H100%",
            "description.ilike.%H200%",
            "description.ilike.%N2D%",
            "description.ilike.%C2D%",
            "description.ilike.%T2A%",
            "description.ilike.%N2 %",
            "description.ilike.%C3 %",
          ].join(",")
        ),
      supabase
        .from("runpod_spot_prices")
        .select("gpu_type_id, cloud_tier, display_name, spot_price_usd_per_gpu, fetched_at"),
      supabase
        .from("vast_spot_prices")
        .select("gpu_label, gpu_name, cloud_tier, display_name, spot_price_usd_per_gpu, reliability, fetched_at"),
    ]);

  const advisorBlob = advisorResult.data?.[0]?.data?.spot_advisor ?? {};
  const azureEvMap = new Map<string, string>();
  for (const e of azureEvictionsResult.data ?? []) {
    if (!e.skuName || !e.location) continue;
    const key = azureEvictionKey(e.skuName, e.location);
    if (azureEvMap.has(key)) continue;
    azureEvMap.set(key, e.evictionRate ?? "");
  }

  const pages: string[] = [];

  // AWS pages
  for (const row of awsPricesResult.data ?? []) {
    const gpu = awsGpu(row.instance_type);
    if (!gpu) continue;
    const gpuCount = GPU_COUNTS[row.instance_type] ?? 1;
    const regionAdvisor = advisorBlob[row.region]?.["Linux"] ?? {};
    const entry = regionAdvisor[row.instance_type];
    const evictionLabel = entry != null ? awsRangeLabel(entry.r) : null;
    const color = entry != null ? awsRangeColor(entry.r) : "gray";
    const riskTier = RISK_TIER[color];
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general workloads", "real-time inference"];

    pages.push(
      `# ${gpu} spot ${row.region} (AWS ${row.instance_type})\n` +
      `Cloud: AWS | Instance: ${row.instance_type} | Type: ${gpu} | Count/instance: ${gpuCount}\n` +
      `Spot price: $${Number(row.price_usd).toFixed(4)}/hr per unit ($${(Number(row.price_usd) * gpuCount).toFixed(2)}/hr total)\n` +
      `Eviction rate (7-day): ${evictionLabel ?? "unknown"} | Risk: ${riskTier}\n` +
      `Recommended for: ${recFor}\n` +
      `Not recommended for: ${notRecFor}\n` +
      `Updated: ${now} | Source: Spoticker / AWS spot-bid-advisor`
    );
  }

  // Azure pages
  for (const row of azurePricesResult.data ?? []) {
    const sku = row.arm_sku_name ?? row.sku_name ?? "";
    const gpu = azureGpu(sku);
    if (!gpu) continue;
    const evLabel = azureEvMap.get(azureEvictionKey(sku, row.region)) ?? null;
    const color = evLabel ? evictionColor(evLabel) : "gray";
    const riskTier = RISK_TIER[color];
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general workloads", "real-time inference"];

    pages.push(
      `# ${gpu} spot ${row.region} (Azure ${sku})\n` +
      `Cloud: Azure | SKU: ${sku} | Type: ${gpu}\n` +
      `Spot price: $${Number(row.retail_price).toFixed(4)}/hr\n` +
      `Eviction rate: ${evLabel ?? "unknown"} | Risk: ${riskTier}\n` +
      `Recommended for: ${recFor}\n` +
      `Not recommended for: ${notRecFor}\n` +
      `Updated: ${now} | Source: Spoticker / Azure Retail Prices API`
    );
  }

  // GCP pages
  for (const row of gcpPricesResult.data ?? []) {
    const gpu = gcpGpu(row.description ?? "");
    if (!gpu || row.price_usd_per_hour == null) continue;
    const rawRegions = typeof row.regions === "string" ? JSON.parse(row.regions) : row.regions;
    const regions: string[] = Array.isArray(rawRegions) ? rawRegions : [];
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general workloads", "real-time inference"];

    for (const region of regions) {
      pages.push(
        `# ${gpu} preemptible ${region} (GCP)\n` +
        `Cloud: GCP | Description: ${row.description} | Type: ${gpu}\n` +
        `Preemptible price: $${Number(row.price_usd_per_hour).toFixed(4)}/hr (accelerator cost only — add VM CPU/RAM cost)\n` +
        `Eviction rate: N/A (no public GCP preemptible eviction data) | Risk: UNKNOWN\n` +
        `Recommended for: ${recFor}\n` +
        `Not recommended for: ${notRecFor}\n` +
        `Updated: ${now} | Source: Spoticker / GCP Cloud Billing Catalog`
      );
    }
  }

  // RunPod pages (Community vs Secure Cloud as separate tiers)
  for (const row of runpodPricesResult.data ?? []) {
    const gpu = runpodGpu(row.gpu_type_id ?? "");
    if (!gpu || row.spot_price_usd_per_gpu == null) continue;
    const tier = row.cloud_tier === "secure" ? "Secure Cloud" : "Community Cloud";
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general workloads", "real-time inference"];

    pages.push(
      `# ${gpu} spot ${tier} (RunPod ${row.display_name ?? row.gpu_type_id})\n` +
      `Cloud: RunPod | GPU: ${row.gpu_type_id} | Tier: ${tier} | Type: ${gpu}\n` +
      `Spot price: $${Number(row.spot_price_usd_per_gpu).toFixed(4)}/GPU-hr\n` +
      `Interrupt notice: ${RUNPOD_INTERRUPT_LABEL} before termination\n` +
      `Eviction rate: N/A (marketplace spot; no historical eviction telemetry) | Risk: UNKNOWN\n` +
      `Recommended for: ${recFor}\n` +
      `Not recommended for: ${notRecFor}\n` +
      `Updated: ${row.fetched_at ?? now} | Source: Spoticker / RunPod GraphQL`
    );
  }

  // Vast.ai pages (community = unverified hosts, secure = verified)
  for (const row of vastPricesResult.data ?? []) {
    const gpu: GpuLabel | null =
      (row.gpu_label as GpuLabel | null) ??
      vastGpu(row.gpu_name ?? row.display_name ?? "");
    if (!gpu || row.spot_price_usd_per_gpu == null) continue;
    const tier = row.cloud_tier === "secure" ? "Secure (verified)" : "Community (unverified)";
    const reliability = row.reliability != null ? Number(row.reliability) : null;
    const relLabel = reliability != null ? vastReliabilityLabel(reliability) : "unknown";
    const color = reliability != null ? vastReliabilityColor(reliability) : "gray";
    const riskTier = RISK_TIER[color];
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general workloads", "real-time inference"];

    pages.push(
      `# ${gpu} interruptible ${tier} (Vast.ai ${row.display_name ?? row.gpu_name})\n` +
      `Cloud: Vast.ai | GPU: ${row.gpu_name ?? gpu} | Tier: ${tier} | Type: ${gpu}\n` +
      `Interruptible price: $${Number(row.spot_price_usd_per_gpu).toFixed(4)}/GPU-hr\n` +
      `Host reliability: ${relLabel} | Risk: ${riskTier}\n` +
      `Recommended for: ${recFor}\n` +
      `Not recommended for: ${notRecFor}\n` +
      `Updated: ${row.fetched_at ?? now} | Source: Spoticker / Vast.ai REST API`
    );
  }

  return { context: pages.join("\n\n---\n\n"), timestamp: now };
}

export async function buildRecommendationResponse(
  prompt: string
): Promise<RecommendationResponse> {
  const { context, timestamp } = await buildPricingContext();

  if (!context) {
    return {
      title: "No pricing data available",
      summary: "No spot pricing data could be retrieved. Check Supabase connectivity.",
      reasoning: "Run the AWS and Azure scrapers to populate the database.",
      sources: [],
      options: [],
    };
  }

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is live Spoticker pricing data (as of ${timestamp}):\n\n${context}\n\n---\n\nWorkload request: ${prompt}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON: find outermost { ... } block
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1)) as RecommendationResponse;
    } catch { /* fall through */ }
  }

  return {
    title: "Spoticker recommendation",
    summary: raw.slice(0, 300),
    reasoning: raw,
    sources: ["Spoticker live pricing catalog"],
    options: [],
  };
}
