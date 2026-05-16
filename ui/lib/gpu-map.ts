export type GpuLabel = "T4" | "A10G" | "L4" | "V100" | "A100" | "H100";

export const GPU_ORDER: GpuLabel[] = ["T4", "A10G", "L4", "V100", "A100", "H100"];

// AWS instance family prefix → GPU
const AWS_FAMILY: Record<string, GpuLabel> = {
  g4dn: "T4",
  g5: "A10G",
  g6: "L4",
  p3: "V100",
  p4d: "A100",
  p4de: "A100",
  p5: "H100",
};

// Azure arm_sku_name pattern keywords → GPU
const AZURE_PATTERNS: [RegExp, GpuLabel][] = [
  [/T4/i, "T4"],
  [/A10/i, "A10G"],
  [/L4/i, "L4"],
  [/V100/i, "V100"],
  [/A100/i, "A100"],
  [/H100/i, "H100"],
];

// GCP description keywords → GPU
const GCP_PATTERNS: [RegExp, GpuLabel][] = [
  [/\bT4\b/i, "T4"],
  [/\bA10\b/i, "A10G"],
  [/\bL4\b/i, "L4"],
  [/\bV100\b/i, "V100"],
  [/\bA100\b/i, "A100"],
  [/\bH100\b/i, "H100"],
];

export function awsGpu(instanceType: string): GpuLabel | null {
  const family = instanceType.split(".")[0];
  return AWS_FAMILY[family] ?? null;
}

export function azureGpu(armSkuName: string): GpuLabel | null {
  for (const [re, gpu] of AZURE_PATTERNS) {
    if (re.test(armSkuName)) return gpu;
  }
  return null;
}

/** Normalize SKU + region for joining prices (PascalCase) to eviction rows (lowercase). */
export function azureEvictionKey(armSkuName: string, region: string): string {
  return `${armSkuName.toLowerCase()}::${region.toLowerCase()}`;
}

export function gcpGpu(description: string): GpuLabel | null {
  for (const [re, gpu] of GCP_PATTERNS) {
    if (re.test(description)) return gpu;
  }
  return null;
}

// Eviction rate string → traffic-light color
export type CellColor = "green" | "yellow" | "red" | "gray";

export function evictionColor(rate: string | null): CellColor {
  if (!rate) return "gray";
  const low = rate.toLowerCase().replace(/\s/g, "");
  if (low.startsWith("0-5") || low === "<5%" || low === "0-5%") return "green";
  if (low.startsWith("5-10") || low.startsWith("10-15")) return "yellow";
  return "red";
}

// AWS bid advisor `r` value → eviction label + color
export function awsRangeLabel(r: number): string {
  return ["<5%", "5-10%", "10-15%", "15-20%", ">20%"][r] ?? "unknown";
}
export function awsRangeColor(r: number): CellColor {
  if (r === 0) return "green";
  if (r <= 2) return "yellow";
  return "red";
}
