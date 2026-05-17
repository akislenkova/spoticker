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
  const dot = {
    green: "bg-emerald-400",
    yellow: "bg-amber-400",
    red: "bg-red-400",
    gray: "bg-zinc-600",
  }[color];

  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1.5 w-2 h-2 shrink-0 rounded-full ${dot}`} />
      <span>
        <span className="text-zinc-300">{label}</span>
        {detail ? <span className="text-zinc-600"> — {detail}</span> : null}
      </span>
    </li>
  );
}

export default function MatrixLegend({ awsMetric }: { awsMetric: AwsMetric }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 text-xs">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-200">AWS</span>
          {awsMetric === "sps" ? (
            <span className="rounded bg-sky-950 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-sky-400">
              Spot Placement Score
            </span>
          ) : awsMetric === "eviction" ? (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Eviction rate
            </span>
          ) : (
            <span className="text-zinc-600">…</span>
          )}
        </div>
        {awsMetric === "sps" ? (
          <>
            <p className="mt-2 text-zinc-500 leading-relaxed">
              Cell color uses your account&apos;s{" "}
              <strong className="font-medium text-zinc-400">Spot Placement Score</strong> (1–10).
              Higher = better odds of getting spot capacity in that region—not eviction %.
            </p>
            <ul className="mt-2 space-y-1">
              <LegendRow color="green" label="8–10" detail="high placement (best)" />
              <LegendRow color="yellow" label="5–7" detail="medium placement" />
              <LegendRow color="red" label="1–4" detail="low placement (risky)" />
            </ul>
            <p className="mt-2 text-zinc-600">
              Small line under the score = AWS advisor eviction % (reference only).
            </p>
          </>
        ) : awsMetric === "eviction" ? (
          <>
            <p className="mt-2 text-zinc-500 leading-relaxed">
              Cell color uses AWS Spot Advisor{" "}
              <strong className="font-medium text-zinc-400">7-day eviction frequency</strong>.
              Lower % = greener cell.
            </p>
            <ul className="mt-2 space-y-1">
              <LegendRow color="green" label="&lt;5%" detail="low eviction" />
              <LegendRow color="yellow" label="5–15%" detail="medium eviction" />
              <LegendRow color="red" label="&gt;15%" detail="high eviction" />
            </ul>
            <p className="mt-2 text-zinc-600">
              Connect AWS to replace colors with live Spot Placement Scores.
            </p>
          </>
        ) : (
          <p className="mt-2 text-zinc-600">Loading AWS metric…</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-200">Azure</span>
          <span className="rounded bg-violet-950 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-400">
            Eviction rate
          </span>
        </div>
        <p className="mt-2 text-zinc-500 leading-relaxed">
          Cell color is Azure Resource Graph{" "}
          <strong className="font-medium text-zinc-400">spot eviction %</strong> for that SKU and
          region. Lower % = greener cell.
        </p>
        <ul className="mt-2 space-y-1">
          <LegendRow color="green" label="0–5%" detail="low eviction" />
          <LegendRow color="yellow" label="5–15%" detail="medium eviction" />
          <LegendRow color="red" label="15%+ / 20+" detail="high eviction" />
          <LegendRow color="gray" label="No data" detail="price only, no eviction row" />
        </ul>
      </div>
    </div>
  );
}
