import { formatFreshness } from "@/lib/format-time";
import type { DataFreshness } from "@/lib/matrix";

function Item({ label, at }: { label: string; at: string | null }) {
  return (
    <span>
      <span className="text-[#2d4038]">{label}</span>{" "}
      <span className={at ? "text-[#4a6a58]" : "text-[#1e3028]"} title={at ?? undefined}>
        {formatFreshness(at)}
      </span>
    </span>
  );
}

export default function DataFreshnessBar({ freshness }: { freshness: DataFreshness }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#2d4038] tracking-wide">
      <span className="text-[#1e3028]">// data refreshed:</span>
      <Item label="AWS prices" at={freshness.awsPricesAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="AWS eviction" at={freshness.awsAdvisorAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="Azure prices" at={freshness.azurePricesAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="Azure eviction" at={freshness.azureEvictionAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="GCP prices" at={freshness.gcpPricesAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="RunPod prices" at={freshness.runpodPricesAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="Vast.ai prices" at={freshness.vastPricesAt} />
      <span className="text-[#1a2e22] hidden sm:inline">·</span>
      <Item label="CoreWeave prices" at={freshness.coreweavePricesAt} />
    </p>
  );
}
