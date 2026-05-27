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
