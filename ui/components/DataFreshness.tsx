import { formatFreshness } from "@/lib/format-time";
import type { DataFreshness } from "@/lib/matrix";

function Item({ label, at }: { label: string; at: string | null }) {
  return (
    <span>
      <span className="text-zinc-500">{label}</span>{" "}
      <span className={at ? "text-zinc-300" : "text-zinc-600"} title={at ?? undefined}>
        {formatFreshness(at)}
      </span>
    </span>
  );
}

export default function DataFreshnessBar({ freshness }: { freshness: DataFreshness }) {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
      <span className="text-zinc-600">Data refreshed:</span>
      <Item label="AWS prices" at={freshness.awsPricesAt} />
      <span className="text-zinc-700 hidden sm:inline">·</span>
      <Item label="AWS eviction" at={freshness.awsAdvisorAt} />
      <span className="text-zinc-700 hidden sm:inline">·</span>
      <Item label="Azure prices" at={freshness.azurePricesAt} />
      <span className="text-zinc-700 hidden sm:inline">·</span>
      <Item label="Azure eviction" at={freshness.azureEvictionAt} />
    </p>
  );
}
