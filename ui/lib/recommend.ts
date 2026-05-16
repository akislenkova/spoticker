import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "./supabase";
import {
  awsGpu,
  azureGpu,
  azureEvictionKey,
  awsRangeLabel,
  awsRangeColor,
  evictionColor,
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
  T4:         ["batch jobs, smaller fine-tunes, cost-sensitive inference",
               "real-time inference without checkpointing, large model training"],
  A10G:       ["batch inference, mid-size fine-tunes, A10G-optimised workloads",
               "stateful training without checkpointing"],
  L4:         ["transformer inference, batch jobs, cost-sensitive fine-tuning",
               "real-time latency-sensitive serving"],
  V100:       ["batch training, legacy model fine-tunes",
               "new workloads (A100 is cheaper and faster), real-time inference"],
  A100:       ["large model training, fine-tuning, high-throughput batch inference",
               "real-time inference, stateful training without checkpointing"],
  H100:       ["frontier model training, maximum throughput batch inference",
               "cost-sensitive workloads, real-time serving where A100 suffices"],
};

const GPU_COUNTS: Record<string, number> = {
  "g4dn.xlarge": 1, "g4dn.2xlarge": 1, "g4dn.4xlarge": 1,
  "g4dn.8xlarge": 1, "g4dn.12xlarge": 4, "g4dn.16xlarge": 1, "g4dn.metal": 8,
  "g5.xlarge": 1, "g5.2xlarge": 1, "g5.4xlarge": 1, "g5.8xlarge": 1,
  "g5.12xlarge": 4, "g5.16xlarge": 1, "g5.24xlarge": 4, "g5.48xlarge": 8,
  "p3.2xlarge": 1, "p3.8xlarge": 4, "p3.16xlarge": 8, "p3dn.24xlarge": 8,
  "p4d.24xlarge": 8, "p4de.24xlarge": 8, "p5.48xlarge": 8,
};

const RISK_TIER: Record<string, string> = {
  green: "LOW", yellow: "MEDIUM", red: "HIGH", gray: "UNKNOWN",
};

const SYSTEM_PROMPT = `You are Spoticker's recommendation engine. You have live GPU spot pricing data from the Spoticker catalog.

Given a workload description and a set of live pricing pages, return a specific, opinionated recommendation like a senior infra engineer would give.

Rules:
- NEVER recommend spot for real-time inference, stateful services, or latency-sensitive workloads — say so explicitly
- For batch training / fine-tuning that tolerates eviction: optimise cost × risk together, not just cheapest price
- Be opinionated: pick one winner, explain why, acknowledge the tradeoff
- Cite actual prices and eviction rates from the data — do not hallucinate numbers
- If the workload is risky on spot, warn and suggest on-demand or reserved as fallback
- If no exact GPU match exists in the data, recommend the closest available option and note the gap

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

  const [awsPricesResult, advisorResult, azurePricesResult, azureEvictionsResult] =
    await Promise.all([
      supabase.rpc("latest_aws_spot_prices"),
      supabase.from("spot_bid_advisor").select("data").order("fetched_at", { ascending: false }).limit(1),
      supabase.rpc("latest_azure_spot_prices"),
      supabase
        .from("azure_spot_eviction_rates")
        .select("skuName, location, evictionRate, fetched_at")
        .or(
          "skuName.ilike.%t4%,skuName.ilike.%a10%,skuName.ilike.%l4%,skuName.ilike.%v100%,skuName.ilike.%a100%,skuName.ilike.%h100%"
        )
        .order("fetched_at", { ascending: false })
        .limit(2000),
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
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general GPU workloads", "real-time inference"];

    pages.push(
      `# ${gpu} spot ${row.region} (AWS ${row.instance_type})\n` +
      `Cloud: AWS | Instance: ${row.instance_type} | GPU: ${gpu} | GPUs/instance: ${gpuCount}\n` +
      `Spot price: $${Number(row.price_usd).toFixed(4)}/hr per GPU ($${(Number(row.price_usd) * gpuCount).toFixed(2)}/hr total)\n` +
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
    const [recFor, notRecFor] = WORKLOAD_NOTES[gpu] ?? ["general GPU workloads", "real-time inference"];

    pages.push(
      `# ${gpu} spot ${row.region} (Azure ${sku})\n` +
      `Cloud: Azure | SKU: ${sku} | GPU: ${gpu}\n` +
      `Spot price: $${Number(row.retail_price).toFixed(4)}/hr per GPU\n` +
      `Eviction rate: ${evLabel ?? "unknown"} | Risk: ${riskTier}\n` +
      `Recommended for: ${recFor}\n` +
      `Not recommended for: ${notRecFor}\n` +
      `Updated: ${now} | Source: Spoticker / Azure Retail Prices API`
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
