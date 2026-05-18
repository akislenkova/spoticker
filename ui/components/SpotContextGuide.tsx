export default function SpotContextGuide() {
  return (
    <div className="grid gap-3 sm:grid-cols-3 text-xs">
      {[
        {
          title: "Spot availability matrix",
          body: "Cheapest spot price per GPU type and region. Cell color reflects eviction risk (Azure eviction %, or AWS Spot Placement Score when your account is connected). Green = safer for batch work; red = frequent interruptions.",
        },
        {
          title: "GBrain catalog",
          body: "Live pricing is ingested into GBrain as one page per GPU×region, with workload fit notes (what spot is good for vs. not). Same structured context powers search and downstream agents.",
        },
        {
          title: "Ask Spoticker (agentic)",
          body: "Describe your job (GPU count, duration, batch vs. realtime, eviction tolerance). An agent reads current prices and risk data, then recommends regions—like a senior infra engineer, not just the cheapest cell.",
        },
      ].map(({ title, body }) => (
        <div
          key={title}
          className="relative rounded border border-[rgba(0,255,136,0.09)] bg-[rgba(3,12,9,0.8)] px-4 py-3"
        >
          <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[rgba(0,255,136,0.25)] pointer-events-none" />
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[rgba(0,255,136,0.25)] pointer-events-none" />
          <h3 className="font-mono font-medium text-[#7aab8e] tracking-wide">{title}</h3>
          <p className="mt-1.5 font-mono leading-relaxed text-[#3a5a48]">{body}</p>
        </div>
      ))}
    </div>
  );
}
