export default function SpotContextGuide() {
  return (
    <div className="grid gap-3 sm:grid-cols-3 text-xs">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
        <h3 className="font-medium text-zinc-300">Spot availability matrix</h3>
        <p className="mt-1.5 leading-relaxed text-zinc-500">
          Cheapest spot price per GPU type and region. Cell color reflects eviction risk
          (Azure eviction %, or AWS Spot Placement Score when your account is connected).
          Green = safer for batch work; red = frequent interruptions.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
        <h3 className="font-medium text-zinc-300">GBrain catalog</h3>
        <p className="mt-1.5 leading-relaxed text-zinc-500">
          Live pricing is ingested into GBrain as one page per GPU×region, with workload fit
          notes (what spot is good for vs. not). Same structured context powers search and
          downstream agents.
        </p>
      </div>
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
        <h3 className="font-medium text-zinc-300">Ask Spoticker (agentic)</h3>
        <p className="mt-1.5 leading-relaxed text-zinc-500">
          Describe your job (GPU count, duration, batch vs. realtime, eviction tolerance).
          An agent reads current prices and risk data, then recommends regions—like a senior
          infra engineer, not just the cheapest cell.
        </p>
      </div>
    </div>
  );
}
