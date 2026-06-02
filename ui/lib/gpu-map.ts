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
  | "CPU (ARM)";

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
  "CPU (ARM)",
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
  // CPU families — ARM (AWS Graviton)
  m7g: "CPU (ARM)",
  m6g: "CPU (ARM)",
  c7g: "CPU (ARM)",
  c6g: "CPU (ARM)",
  r7g: "CPU (ARM)",
};

// Azure arm_sku_name pattern keywords → hardware type
// Order matters: more specific patterns first
const AZURE_PATTERNS: [RegExp, GpuLabel][] = [
  [/H200/i, "H200"],
  [/H100/i, "H100"],
  // All Azure A100 is 80 GB (both NC A100 v4 PCIe and ND SXM4 80 GB).
  // Azure has no 40 GB A100 SKUs.
  [/A100/i, "A100 80GB"],
  [/V100/i, "V100"],
  [/L40S/i, "L40S"],
  // \bL4\b avoids matching Lsv3 storage VMs like Standard_L48as_v3 (L4 followed by 8).
  // Azure has no L4 GPU spot offering, so in practice this pattern is a no-op there;
  // it's kept so the recommend engine doesn't misclassify hypothetical future SKUs.
  [/\bL4\b/i, "L4"],
  [/A10/i, "A10G"],
  [/T4/i, "T4"],
  // CPU types — D-series only (representative family per architecture)
  [/Standard_D\d+a[sd]?s_v[45]/i, "CPU (AMD)"],    // e.g. Standard_D4as_v5
  [/Standard_D\d+p[ls]?s_v[45]/i, "CPU (ARM)"],    // e.g. Standard_D4ps_v5
  [/Standard_D\d+d?s_v5/i,        "CPU (Intel)"],   // e.g. Standard_D4s_v5
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
  [/\bT2A\b/i, "CPU (ARM)"],
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

// RunPod gpuTypes.id → hardware type (order: specific before general)
const RUNPOD_PATTERNS: [RegExp, GpuLabel][] = [
  [/\bH200\b/i, "H200"],
  [/\bH100\b/i, "H100"],
  [/A100.*80\s*GB/i, "A100 80GB"],
  [/A100.*40\s*GB/i, "A100 40GB"],
  [/\bA100\b/i, "A100 80GB"],
  [/\bV100\b/i, "V100"],
  [/\bL40S\b/i, "L40S"],
  [/\bL40\b/i, "L40S"],
  [/\bL4\b/i, "L4"],
  [/\bA10\b/i, "A10G"],
  [/\bT4\b/i, "T4"],
];

export function runpodGpu(gpuTypeId: string): GpuLabel | null {
  for (const [re, gpu] of RUNPOD_PATTERNS) {
    if (re.test(gpuTypeId)) return gpu;
  }
  return null;
}

/** RunPod spot pods receive ~5s SIGTERM before termination (vs AWS ~2 min). */
export const RUNPOD_INTERRUPT_LABEL = "5s SIGTERM";

// Vast.ai gpu_name → hardware type (order: specific before general)
const VAST_PATTERNS: [RegExp, GpuLabel][] = [
  [/\bH200\b/i, "H200"],
  [/\bH100\b/i, "H100"],
  [/A100.*80\s*GB/i, "A100 80GB"],
  [/A100.*40\s*GB/i, "A100 40GB"],
  [/\bA100\b/i, "A100 80GB"],
  [/\bV100\b/i, "V100"],
  [/\bL40S\b/i, "L40S"],
  [/\bL40\b/i, "L40S"],
  [/\bL4\b/i, "L4"],
  [/\bA10\b/i, "A10G"],
  [/\bT4\b/i, "T4"],
];

export function vastGpu(gpuName: string): GpuLabel | null {
  for (const [re, gpu] of VAST_PATTERNS) {
    if (re.test(gpuName)) return gpu;
  }
  return null;
}

/** CoreWeave spot instances are preemptible; no public eviction telemetry. */
export const COREWEAVE_SPOT_LABEL = "preemptible";

// CoreWeave model_name / gpu_label from scraper → hardware type (order: specific first)
const COREWEAVE_PATTERNS: [RegExp, GpuLabel][] = [
  [/\bH200\b/i, "H200"],
  [/\bH100\b/i, "H100"],
  [/A100.*80\s*GB/i, "A100 80GB"],
  [/A100.*40\s*GB/i, "A100 40GB"],
  [/\bA100\b/i, "A100 80GB"],
  [/\bV100\b/i, "V100"],
  [/\bL40S\b/i, "L40S"],
  [/\bL40\b/i, "L40S"],
  [/\bL4\b/i, "L4"],
  [/\bA10\b/i, "A10G"],
  [/\bT4\b/i, "T4"],
  [/\bAMD\b/i, "CPU (AMD)"],
  [/\bIntel\b/i, "CPU (Intel)"],
];

export function coreweaveGpu(labelOrModel: string): GpuLabel | null {
  for (const [re, gpu] of COREWEAVE_PATTERNS) {
    if (re.test(labelOrModel)) return gpu;
  }
  return null;
}

/** Vast.ai host reliability (0–1) → display label and traffic-light color. */
export function vastReliabilityLabel(reliability: number): string {
  return `${(reliability * 100).toFixed(1)}%`;
}

export function vastReliabilityColor(reliability: number): CellColor {
  if (reliability >= 0.99) return "green";
  if (reliability >= 0.97) return "yellow";
  return "red";
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
