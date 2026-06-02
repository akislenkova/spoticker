const AZURE: Record<string, string> = {
  australiacentral: "australia-central",
  australiacentral2: "australia-central-2",
  australiaeast: "australia-east",
  australiasoutheast: "australia-southeast",
  austriaeast: "austria-east",
  belgiumcentral: "belgium-central",
  brazilsouth: "brazil-south",
  brazilsoutheast: "brazil-southeast",
  canadacentral: "canada-central",
  canadaeast: "canada-east",
  centralindia: "central-india",
  centralus: "central-us",
  chilecentral: "chile-central",
  denmarkeast: "denmark-east",
  eastasia: "east-asia",
  eastus: "east-us",
  eastus2: "east-us-2",
  francecentral: "france-central",
  francesouth: "france-south",
  germanynorth: "germany-north",
  germanywestcentral: "germany-west-central",
  indiasouthcentral: "india-south-central",
  indonesiacentral: "indonesia-central",
  israelcentral: "israel-central",
  israelnorthwest: "israel-northwest",
  italynorth: "italy-north",
  japaneast: "japan-east",
  japanwest: "japan-west",
  koreacentral: "korea-central",
  koreasouth: "korea-south",
  malaysiawest: "malaysia-west",
  mexicocentral: "mexico-central",
  newzealandnorth: "new-zealand-north",
  northcentralus: "north-central-us",
  northeurope: "north-europe",
  norwayeast: "norway-east",
  norwaywest: "norway-west",
  polandcentral: "poland-central",
  qatarcentral: "qatar-central",
  sgxsingapore1: "sgx-singapore-1",
  southafricanorth: "south-africa-north",
  southafricawest: "south-africa-west",
  southcentralus: "south-central-us",
  southeastasia: "southeast-asia",
  southeastus: "southeast-us",
  southindia: "south-india",
  spaincentral: "spain-central",
  swedencentral: "sweden-central",
  swedensouth: "sweden-south",
  switzerlandnorth: "switzerland-north",
  switzerlandwest: "switzerland-west",
  uaecentral: "uae-central",
  uaenorth: "uae-north",
  uksouth: "uk-south",
  ukwest: "uk-west",
  usgovarizona: "usgov-arizona",
  usgovtexas: "usgov-texas",
  usgovvirginia: "usgov-virginia",
  westcentralus: "west-central-us",
  westeurope: "west-europe",
  westindia: "west-india",
  westus: "west-us",
  westus2: "west-us-2",
  westus3: "west-us-3",
};

const NEOCLOUD_TIER: Record<string, string> = {
  community: "community-cloud",
  secure: "secure-cloud",
};

const COREWEAVE_REGION: Record<string, string> = {
  us: "north-america",
  eu: "europe",
};

/** Returns a dash-separated region label for display. AWS regions already have dashes; Azure ones don't. */
export function formatRegion(region: string): string {
  if (region in NEOCLOUD_TIER) return NEOCLOUD_TIER[region];
  if (region in COREWEAVE_REGION) return COREWEAVE_REGION[region];
  if (region.includes("-")) return region;
  return AZURE[region] ?? region;
}
