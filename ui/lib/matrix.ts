import { supabase } from "./supabase";
import {
  GPU_ORDER,
  GpuLabel,
  CellColor,
  awsGpu,
  azureGpu,
  awsRangeLabel,
  awsRangeColor,
  evictionColor,
} from "./gpu-map";
import { awsEc2LaunchUrl, azureVmCreateUrl } from "./cloud-links";

export type CellData = {
  price: number | null;
  evictionLabel: string | null;
  color: CellColor;
  href?: string;
  instanceLabel?: string;
};

export type MatrixColumn = {
  cloud: "aws" | "azure";
  region: string;
  key: string;
};

export type MatrixRow = {
  gpu: GpuLabel;
  cells: Record<string, CellData>;
};

export type MatrixData = {
  columns: MatrixColumn[];
  rows: MatrixRow[];
};

type CellEntry = {
  price: number;
  evictionLabel: string | null;
  color: CellColor;
  instanceLabel: string;
  href: string;
};

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

    const key = `${gpu}::aws:${row.region}`;
    const existing = map.get(key);
    if (!existing || row.price_usd < existing.price) {
      map.set(key, {
        price: row.price_usd,
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

async function fetchAzure(): Promise<Map<string, CellEntry>> {
  const [
    { data: prices, error: pricesErr },
    { data: evictions, error: evErr },
    { data: telemetry, error: telErr },
  ] = await Promise.all([
    supabase.rpc("latest_azure_spot_prices"),
    supabase.rpc("latest_azure_eviction_rates"),
    supabase.from("eviction_rates_30d").select("region, evictions_per_hour"),
  ]);

  if (pricesErr) console.error("[azure] latest_azure_spot_prices:", pricesErr.message);
  if (evErr) console.error("[azure] latest_azure_eviction_rates:", evErr.message);
  if (telErr) console.error("[azure] eviction_rates_30d:", telErr.message);

  const rgMap = new Map<string, { label: string; color: CellColor }>();
  for (const e of evictions ?? []) {
    rgMap.set(`${e.skuName}::${e.location}`, {
      label: e.evictionRate,
      color: evictionColor(e.evictionRate),
    });
  }

  const telMap = new Map<string, { label: string; color: CellColor }>();
  for (const t of telemetry ?? []) {
    if (t.evictions_per_hour != null) {
      telMap.set(t.region, {
        label: telemetryLabel(t.evictions_per_hour),
        color: telemetryColor(t.evictions_per_hour),
      });
    }
  }

  const map = new Map<string, CellEntry>();

  for (const row of prices ?? []) {
    const sku = row.arm_sku_name ?? row.sku_name ?? "";
    const gpu = azureGpu(sku);
    if (!gpu) continue;

    const ev = rgMap.get(`${row.arm_sku_name}::${row.region}`)
      ?? telMap.get(row.region)
      ?? null;

    const key = `${gpu}::azure:${row.region}`;
    const existing = map.get(key);
    if (!existing || row.retail_price < existing.price) {
      map.set(key, {
        price: row.retail_price,
        evictionLabel: ev?.label ?? null,
        color: ev?.color ?? "gray",
        instanceLabel: sku,
        href: azureVmCreateUrl(row.region),
      });
    }
  }

  return map;
}

// ── Matrix assembly ───────────────────────────────────────────────────────────

export async function buildMatrix(): Promise<MatrixData> {
  const [awsMap, azureMap] = await Promise.all([fetchAws(), fetchAzure()]);

  const columnSet = new Set<string>();
  for (const key of [...awsMap.keys(), ...azureMap.keys()]) {
    columnSet.add(key.split("::")[1]);
  }

  const columns: MatrixColumn[] = [...columnSet]
    .sort((a, b) => {
      const [ca, ra] = a.split(":");
      const [cb, rb] = b.split(":");
      const cloudOrder = { aws: 0, azure: 1 } as Record<string, number>;
      return (cloudOrder[ca] ?? 9) - (cloudOrder[cb] ?? 9) || ra.localeCompare(rb);
    })
    .map((cr) => {
      const idx = cr.indexOf(":");
      const cloud = cr.slice(0, idx) as MatrixColumn["cloud"];
      const region = cr.slice(idx + 1);
      return { cloud, region, key: cr };
    });

  const allData = new Map([...awsMap, ...azureMap]);

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

  return { columns, rows };
}
