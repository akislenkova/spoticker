/** AWS EC2 launch wizard deep link (instance type prefilled; user selects Spot). */
export function awsEc2LaunchUrl(region: string, instanceType: string): string {
  const r = encodeURIComponent(region);
  const t = encodeURIComponent(instanceType);
  return `https://${region}.console.aws.amazon.com/ec2/home?region=${r}#LaunchInstanceWizard:instanceType=${t}`;
}

/** Azure portal Create VM blade scoped to a region (SKU not pre-selectable via URL). */
export function azureVmCreateUrl(region: string): string {
  const params = new URLSearchParams({ location: region });
  return `https://portal.azure.com/#create/Microsoft.VirtualMachine-ARM?${params.toString()}`;
}

/** GCP Cloud Console — create a preemptible VM in a given region. */
export function gcpVmCreateUrl(region: string): string {
  return `https://console.cloud.google.com/compute/instancesAdd?region=${encodeURIComponent(region)}`;
}

/** RunPod console — deploy a spot (interruptible) pod; tier selects Community vs Secure Cloud. */
export function runpodSpotDeployUrl(tier: "community" | "secure"): string {
  const base =
    tier === "secure"
      ? "https://www.runpod.io/console/gpu-secure-cloud"
      : "https://www.runpod.io/console/gpu-cloud";
  return `${base}?interruptable=true`;
}

/** Vast.ai marketplace — search interruptible offers; tier maps to verified vs community hosts. */
export function vastOfferSearchUrl(
  gpuName: string,
  tier: "community" | "secure"
): string {
  const params = new URLSearchParams({
    gpu_name: gpuName.replace(/\s+/g, "_"),
    type: "bid",
    verified: tier === "secure" ? "true" : "false",
  });
  return `https://cloud.vast.ai/?${params.toString()}`;
}

/** CoreWeave pricing page — spot requires sales onboarding, no self-serve API. */
export function coreweavePricingUrl(): string {
  return "https://www.coreweave.com/pricing";
}

/** Nebius console — create a preemptible GPU VM (platform not pre-selectable via URL). */
export function nebiusVmCreateUrl(): string {
  return "https://console.nebius.com/compute/instances/create";
}
