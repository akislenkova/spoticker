export type GpuLabel =
  | "H200"
  | "H100"
  | "A100 80GB"
  | "A100 40GB"
  | "V100"
  | "L40S"
  | "L4"
  | "A10G"
  | "T4"
  | "CPU (AMD)"
  | "CPU (Intel)"
  | "CPU (Graviton)";

export const GPU_ORDER: GpuLabel[] = [
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
  "CPU (Graviton)",
];

// AWS instance family prefix → hardware type
const AWS_FAMILY: Record<string, GpuLabel> = {
  // GPU families
  p5e: "H200",
  p5: "H100",
  p4de: "A100 80GB",
  p4d: "A100 40GB",
  p3: "V100",
  g6e: "L40S",
  g6: "L4",
  g5: "A10G",
  g4dn: "T4",
  // CPU families — AMD EPYC
  m7a: "CPU (AMD)",
  m6a: "CPU (AMD)",
  c7a: "CPU (AMD)",
  c6a: "CPU (AMD)",
  r7a: "CPU (AMD)",
  // CPU families — Intel
  m7i: "CPU (Intel)",
  m6i: "CPU (Intel)",
  c7i: "CPU (Intel)",
  c6i: "CPU (Intel)",
  r7i: "CPU (Intel)",
  // CPU families — Graviton (ARM)
  m7g: "CPU (Graviton)",
  m6g: "CPU (Graviton)",
  c7g: "CPU (Graviton)",
  c6g: "CPU (Graviton)",
  r7g: "CPU (Graviton)",
};

// Azure arm_sku_name pattern keywords → hardware type
// Order matters: more specific patterns first
const AZURE_PATTERNS: [RegExp, GpuLabel][] = [
  [/H200/i, "H200"],
  [/H100/i, "H100"],
  // A100 80GB: ND series (SXM4 80 GB) — check before generic A100
  [/A100.*80/i, "A100 80GB"],
  [/nd.*A100/i, "A100 80GB"],
  [/A100/i, "A100 40GB"],
  [/V100/i, "V100"],
  [/L40S/i, "L40S"],
  [/L4/i, "L4"],
  [/A10/i, "A10G"],
  [/T4/i, "T4"],
  // CPU types — AMD EPYC (as_v suffix pattern)
  [/Standard_[a-z]\d+a[sd]?s_v[45]/i, "CPU (AMD)"],
  // CPU types — ARM Ampere Altra (ps_v suffix pattern)
  [/Standard_[a-z]\d+p[ls]?s_v[45]/i, "CPU (Graviton)"],
  // CPU types — Intel (s_v suffix, no a/p modifier before s)
  [/Standard_[a-z]\d+d?s_v5/i, "CPU (Intel)"],
];

// GCP description keywords → hardware type
// Order matters: more specific patterns first
const GCP_PATTERNS: [RegExp, GpuLabel][] = [
  [/\bH200\b/i, "H200"],
  [/\bH100\b/i, "H100"],
  [/A100.*80GB/i, "A100 80GB"],
  [/\bA100\b/i, "A100 40GB"],
  [/\bV100\b/i, "V100"],
  [/\bL40S\b/i, "L40S"],
  [/\bL4\b/i, "L4"],
  [/\bA10\b/i, "A10G"],
  [/\bT4\b/i, "T4"],
  // CPU types — match GCP billing catalog description prefixes
  [/\b(N2D|C2D)\b/i, "CPU (AMD)"],
  [/\bT2A\b/i, "CPU (Graviton)"],
  [/\b(N2|C2|C3)\b/i, "CPU (Intel)"],
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
