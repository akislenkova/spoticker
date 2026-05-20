/**
 * Short matrix column labels (≤7 chars). Keys are lowercase Azure/AWS slugs.
 * Hover title uses prettyRegion() for the full hyphenated name.
 */
const REGION_HEADER: Record<string, string> = {
  attatlanta1: "ATT-ATL",
  attdallas1: "ATT-DAL",
  australiacentral: "AU-C",
  australiacentral2: "AU-C2",
  australiaeast: "AU-E",
  australiasoutheast: "AU-SE",
  austriaeast: "AT-E",
  belgiumcentral: "BE-C",
  brazilsouth: "BR-S",
  brazilsoutheast: "BR-SE",
  canadacentral: "CA-C",
  canadaeast: "CA-E",
  centralindia: "IN-C",
  centralus: "CUS",
  chilecentral: "CL-C",
  denmarkeast: "DK-E",
  eastasia: "EAS",
  eastus: "EUS",
  eastus2: "EUS2",
  francecentral: "FR-C",
  francesouth: "FR-S",
  germanynorth: "DE-N",
  germanywestcentral: "DE-WC",
  indiasouthcentral: "IN-SC",
  indonesiacentral: "ID-C",
  israelcentral: "IL-C",
  israelnorthwest: "IL-NW",
  italynorth: "IT-N",
  japaneast: "JP-E",
  japanwest: "JP-W",
  koreacentral: "KR-C",
  koreasouth: "KR-S",
  malaysiawest: "MY-W",
  mexicocentral: "MX-C",
  newzealandnorth: "NZ-N",
  northcentralus: "NCUS",
  northeurope: "NEU",
  norwayeast: "NO-E",
  norwaywest: "NO-W",
  polandcentral: "PL-C",
  qatarcentral: "QA-C",
  sgxsingapore1: "SGX-SG",
  southafricanorth: "ZA-N",
  southafricawest: "ZA-W",
  southcentralus: "SCUS",
  southeastasia: "SEA",
  southeastus: "SEUS",
  southindia: "IN-S",
  spaincentral: "ES-C",
  swedencentral: "SE-C",
  swedensouth: "SE-S",
  switzerlandnorth: "CH-N",
  switzerlandwest: "CH-W",
  uaecentral: "AE-C",
  uaenorth: "AE-N",
  uksouth: "UK-S",
  ukwest: "UK-W",
  usgovarizona: "GOV-AZ",
  usgovtexas: "GOV-TX",
  usgovvirginia: "GOV-VA",
  westcentralus: "WCUS",
  westeurope: "WEU",
  westindia: "IN-W",
  westus: "WUS",
  westus2: "WUS2",
  westus3: "WUS3",
  // Common AWS
  "us-east-1": "USE1",
  "us-east-2": "USE2",
  "us-west-1": "USW1",
  "us-west-2": "USW2",
  "eu-west-1": "EUW1",
  "eu-west-2": "EUW2",
  "eu-central-1": "EUC1",
  "ap-southeast-1": "APS1",
  "ap-southeast-2": "APS2",
  "ap-northeast-1": "APN1",
  "ap-northeast-2": "APN2",
  "ap-south-1": "APS1",
};

const REGION_PRETTY: Record<string, string> = {
  attatlanta1: "att-atlanta-1",
  attdallas1: "att-dallas-1",
  sgxsingapore1: "sgx-singapore-1",
  germanywestcentral: "germany-west-central",
  northcentralus: "north-central-us",
  southcentralus: "south-central-us",
  westcentralus: "west-central-us",
  indiasouthcentral: "india-south-central",
  israelnorthwest: "israel-north-west",
  switzerlandnorth: "switzerland-north",
  switzerlandwest: "switzerland-west",
  newzealandnorth: "new-zealand-north",
  southafricanorth: "south-africa-north",
  southafricawest: "south-africa-west",
  usgovarizona: "us-gov-arizona",
  usgovtexas: "us-gov-texas",
  usgovvirginia: "us-gov-virginia",
};

const REGION_TOKENS = [
  "northcentral",
  "southcentral",
  "westcentral",
  "northwest",
  "southeast",
  "southwest",
  "northeast",
  "southeastasia",
  "southafrica",
  "newzealand",
  "centralindia",
  "southindia",
  "westindia",
  "eastasia",
  "switzerland",
  "australia",
  "indonesia",
  "malaysia",
  "singapore",
  "northeurope",
  "westeurope",
  "germany",
  "belgium",
  "brazil",
  "canada",
  "central",
  "chile",
  "denmark",
  "france",
  "india",
  "israel",
  "italy",
  "japan",
  "korea",
  "mexico",
  "norway",
  "poland",
  "qatar",
  "spain",
  "sweden",
  "austria",
  "virginia",
  "arizona",
  "atlanta",
  "dallas",
  "texas",
  "centralus",
  "eastus",
  "westus",
  "north",
  "south",
  "east",
  "west",
  "usgov",
  "att",
  "sgx",
  "uae",
  "uk",
  "us",
].sort((a, b) => b.length - a.length);

function tokenizeRegion(slug: string): string[] {
  let rest = slug.toLowerCase().trim();
  if (!rest) return [];

  let zone = "";
  const zoneMatch = rest.match(/(\d+)$/);
  if (zoneMatch) {
    zone = zoneMatch[1];
    rest = rest.slice(0, -zone.length);
  }

  const parts: string[] = [];

  while (rest.length > 0) {
    let matched = false;
    for (const tok of REGION_TOKENS) {
      if (rest.startsWith(tok)) {
        parts.push(tok);
        rest = rest.slice(tok.length);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    for (const tok of REGION_TOKENS) {
      if (rest.endsWith(tok) && rest.length > tok.length) {
        parts.unshift(tok);
        rest = rest.slice(0, -tok.length);
        matched = true;
        break;
      }
    }
    if (matched) continue;

    parts.push(rest);
    break;
  }

  if (zone) parts.push(zone);
  return parts.filter(Boolean);
}

function fallbackHeader(slug: string): string {
  const us = slug.match(/^(north|south|east|west|central)?(central)?(us)(\d*)$/);
  if (us) {
    const [, a = "", b = "", , z = ""] = us;
    const prefix = (a + b).toUpperCase().replace("central", "C").replace("north", "N").replace("south", "S").replace("east", "E").replace("west", "W");
    return `${prefix}US${z}`.slice(0, 7);
  }
  const parts = tokenizeRegion(slug);
  if (parts.length <= 1) return slug.slice(0, 6).toUpperCase();
  const geo = parts[0]!.slice(0, 2).toUpperCase();
  const rest = parts.slice(1).join("").replace(/\d+/g, (m) => m).slice(0, 4).toUpperCase();
  return `${geo}-${rest}`.slice(0, 7);
}

/** Full hyphenated label for tooltips. */
export function prettyRegion(region: string): string {
  const key = region.toLowerCase();
  if (REGION_PRETTY[key]) return REGION_PRETTY[key];
  if (region.includes("-")) return region.toLowerCase();
  return tokenizeRegion(region).join("-");
}

/** 1 short line for matrix column headers. */
export function regionHeaderLines(region: string): string[] {
  const key = region.toLowerCase();
  const label = REGION_HEADER[key] ?? fallbackHeader(key);
  return [label];
}
