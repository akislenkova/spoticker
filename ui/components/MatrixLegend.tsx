type AwsMetric = "sps" | "eviction" | "loading";

function LegendRow({
  color,
  label,
  detail,
}: {
  color: "green" | "yellow" | "red" | "gray";
  label: string;
  detail?: string;
}) {
  const dot: Record<string, string> = {
    green: "bg-[#00ff88] shadow-[0_0_4px_rgba(0,255,136,0.7)]",
    yellow: "bg-[#ffc200] shadow-[0_0_4px_rgba(255,194,0,0.7)]",
    red: "bg-[#ff4060] shadow-[0_0_4px_rgba(255,64,96,0.7)]",
    gray: "bg-[#2d4038]",
  };

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${dot[color]}`} />
      <span>
        <span className="text-[#7aab8e] font-mono text-[11px]">{label}</span>
        {detail ? (
          <span className="font-mono text-[11px] text-[#2d4038]"> — {detail}</span>
        ) : null}
      </span>
    </li>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.85)] px-4 py-3 backdrop-blur-sm">
      <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(0,255,136,0.3)] pointer-events-none" />
      <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(0,255,136,0.3)] pointer-events-none" />
      <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(0,255,136,0.3)] pointer-events-none" />
      <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(0,255,136,0.3)] pointer-events-none" />
      {children}
    </div>
  );
}

export default function MatrixLegend({ awsMetric }: { awsMetric: AwsMetric }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 text-xs">
      <Panel>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[#7aab8e] tracking-wider">AWS</span>
          {awsMetric === "sps" ? (
            <span className="rounded border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.07)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-widest text-[#00d4ff]">
              Spot Placement Score
            </span>
          ) : awsMetric === "eviction" ? (
            <span className="rounded border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.03)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-widest text-[#3a5a48]">
              Eviction rate
            </span>
          ) : (
            <span className="font-mono text-[#1e3028]">…</span>
          )}
        </div>
        {awsMetric === "sps" ? (
          <>
            <p className="mt-2 font-mono text-[#3a5a48] leading-relaxed text-[11px]">
              Cell color uses your account&apos;s{" "}
              <strong className="font-medium text-[#5e8a6e]">Spot Placement Score</strong> (1–10).
              Higher = better odds of getting spot capacity in that region.
            </p>
            <ul className="mt-2 space-y-1">
              <LegendRow color="green" label="8–10" detail="high placement (best)" />
              <LegendRow color="yellow" label="5–7" detail="medium placement" />
              <LegendRow color="red" label="1–4" detail="low placement (risky)" />
            </ul>
            <p className="mt-2 font-mono text-[11px] text-[#1e3028]">
              Small line under the score = AWS advisor eviction % (reference only).
            </p>
          </>
        ) : awsMetric === "eviction" ? (
          <>
            <p className="mt-2 font-mono text-[#3a5a48] leading-relaxed text-[11px]">
              Cell color uses AWS Spot Advisor{" "}
              <strong className="font-medium text-[#5e8a6e]">7-day eviction frequency</strong>.
              Lower % = greener cell.
            </p>
            <ul className="mt-2 space-y-1">
              <LegendRow color="green" label="&lt;5%" detail="low eviction" />
              <LegendRow color="yellow" label="5–15%" detail="medium eviction" />
              <LegendRow color="red" label="&gt;15%" detail="high eviction" />
            </ul>
            <p className="mt-2 font-mono text-[11px] text-[#1e3028]">
              Connect AWS to replace colors with live Spot Placement Scores.
            </p>
          </>
        ) : (
          <p className="mt-2 font-mono text-[11px] text-[#1e3028]">Loading AWS metric…</p>
        )}
      </Panel>

      <Panel>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-[#7aab8e] tracking-wider">Azure</span>
          <span className="rounded border border-[rgba(255,149,0,0.2)] bg-[rgba(255,149,0,0.07)] px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-widest text-[#ff9500]">
            Eviction rate
          </span>
        </div>
        <p className="mt-2 font-mono text-[#3a5a48] leading-relaxed text-[11px]">
          Cell color is Azure Resource Graph{" "}
          <strong className="font-medium text-[#5e8a6e]">spot eviction %</strong> for that SKU and
          region. Lower % = greener cell.
        </p>
        <ul className="mt-2 space-y-1">
          <LegendRow color="green" label="0–5%" detail="low eviction" />
          <LegendRow color="yellow" label="5–15%" detail="medium eviction" />
          <LegendRow color="red" label="15%+ / 20+" detail="high eviction" />
          <LegendRow color="gray" label="No data" detail="price only, no eviction row" />
        </ul>
      </Panel>
    </div>
  );
}
