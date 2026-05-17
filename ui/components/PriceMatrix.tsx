"use client";

import { MatrixData, CellData } from "@/lib/matrix";
import { CellColor, GpuLabel } from "@/lib/gpu-map";

/** Representative instance type per GPU for SPS lookup (must match aws-assume.ts). */
const AWS_SPS_INSTANCE: Partial<Record<GpuLabel, string>> = {
  T4: "g4dn.xlarge",
  A10G: "g5.xlarge",
  L4: "g6.xlarge",
  A100: "p4d.24xlarge",
  H100: "p5.48xlarge",
};

function spsScoreForCell(
  spsScores: Record<string, number>,
  region: string,
  gpu: GpuLabel
): number | undefined {
  const instance = AWS_SPS_INSTANCE[gpu];
  if (!instance) return undefined;
  return spsScores[`${region}::${instance}`];
}

const CLOUD_LABEL: Record<string, string> = { aws: "AWS", azure: "Azure" };

const CELL_BG: Record<CellColor, string> = {
  green:  "bg-emerald-900/60 border-emerald-700",
  yellow: "bg-amber-900/60 border-amber-700",
  red:    "bg-red-900/60 border-red-700",
  gray:   "bg-zinc-800/40 border-zinc-700",
};

const DOT: Record<CellColor, string> = {
  green:  "bg-emerald-400",
  yellow: "bg-amber-400",
  red:    "bg-red-400",
  gray:   "bg-zinc-600",
};

/** Column width includes td padding — inner box is w-full so cells never bleed into neighbors. */
const COL_W = "w-[112px] min-w-[112px] max-w-[112px]";
const CELL_TD = `${COL_W} p-1 align-middle`;
const CELL_BOX =
  "w-full h-[78px] box-border flex flex-col justify-between gap-0 rounded border px-1.5 py-1 text-center overflow-hidden";
const CELL_BOX_EMPTY =
  "w-full h-[78px] box-border flex flex-col items-center justify-center rounded border px-1.5 py-1 text-center";
const COL_TH =
  `${COL_W} p-1 text-center text-[11px] font-normal text-zinc-500 border-l border-zinc-700 whitespace-nowrap`;

function spsColor(score: number): CellColor {
  if (score >= 8) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

function Cell({
  data,
  spsScore,
  gpu,
  cloud,
  region,
}: {
  data: CellData;
  spsScore?: number;
  gpu: GpuLabel;
  cloud: string;
  region: string;
}) {
  if (data.price === null) {
    return (
      <td className={CELL_TD}>
        <div className={`${CELL_BOX_EMPTY} border-zinc-800 bg-zinc-900/30`}>
          <span className="text-zinc-600 text-xs">—</span>
        </div>
      </td>
    );
  }

  const usesSps = cloud === "aws" && spsScore != null;
  const color = usesSps ? spsColor(spsScore) : data.color;
  const evictionLabel = data.evictionLabel ?? null;

  const cloudName = CLOUD_LABEL[cloud] ?? cloud;
  const ariaLabel = data.instanceLabel
    ? `Open ${gpu} spot in ${region} (${data.instanceLabel}) in ${cloudName} console`
    : `Open ${gpu} spot in ${region} in ${cloudName} console`;

  const metricBadge = usesSps
    ? { label: "SPS", className: "bg-sky-950/80 text-sky-400" }
    : cloud === "azure"
      ? { label: "EVICT", className: "bg-violet-950/80 text-violet-400" }
      : evictionLabel
        ? { label: "EVICT", className: "bg-zinc-800 text-zinc-500" }
        : null;

  const primaryText = usesSps
    ? `${spsScore}/10`
    : evictionLabel
      ? evictionLabel
      : "no data";
  const primaryMuted = !usesSps && evictionLabel == null;
  const showEvictionSub = usesSps && evictionLabel != null;

  const inner = (
    <div
      className={`${CELL_BOX} transition-colors ${CELL_BG[color]} ${
        data.href ? "hover:border-zinc-500 cursor-pointer" : ""
      }`}
    >
      <div className="shrink-0 text-white font-mono text-sm font-medium leading-tight tabular-nums">
        ${data.price.toFixed(4)}
      </div>
      <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 min-w-0 px-0.5">
        <div className="flex items-center justify-center gap-1 w-full">
          <span className={`inline-block w-1.5 h-1.5 shrink-0 rounded-full ${DOT[color]}`} />
          {metricBadge ? (
            <span
              className={`shrink-0 rounded px-0.5 text-[8px] font-semibold uppercase tracking-wide ${metricBadge.className}`}
            >
              {metricBadge.label}
            </span>
          ) : null}
          <span
            className={`text-[10px] leading-tight truncate ${
              primaryMuted ? "text-zinc-600" : "text-zinc-400"
            }`}
          >
            {primaryText}
          </span>
        </div>
        {showEvictionSub && (
          <span className="text-[9px] leading-tight text-zinc-500 truncate w-full">
            advisor evict {evictionLabel}
          </span>
        )}
      </div>
      <div
        className="shrink-0 min-h-[12px] w-full min-w-0 text-zinc-500 text-[9px] leading-tight truncate"
        title={data.instanceLabel}
      >
        {data.instanceLabel ? (
          <>
            {data.instanceLabel}
            {data.href ? <span className="ml-0.5">↗</span> : null}
          </>
        ) : (
          <span className="invisible" aria-hidden>
            —
          </span>
        )}
      </div>
    </div>
  );

  return (
    <td className={CELL_TD}>
      {data.href ? (
        <a
          href={data.href}
          target="_blank"
          rel="noopener noreferrer"
          title={data.instanceLabel}
          aria-label={ariaLabel}
          className="block w-full no-underline text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </td>
  );
}

const AWS_METRIC_SUB: Record<"sps" | "eviction", string> = {
  sps: "Placement score (SPS)",
  eviction: "Eviction rate (advisor)",
};

export default function PriceMatrix({
  data,
  spsScores = {},
  awsUsesSps = false,
}: {
  data: MatrixData;
  spsScores?: Record<string, number>;
  awsUsesSps?: boolean;
}) {
  type Group = { cloud: string; count: number };
  const groups: Group[] = [];
  for (const col of data.columns) {
    const last = groups[groups.length - 1];
    if (last?.cloud === col.cloud) last.count++;
    else groups.push({ cloud: col.cloud, count: 1 });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="text-sm border-separate border-spacing-1 w-max">
        <thead>
          <tr className="bg-zinc-900 border-b border-zinc-700">
            <th className="px-4 py-2 text-left text-zinc-500 font-medium w-20" rowSpan={2}>
              GPU
            </th>
            {groups.map((g) => (
              <th
                key={g.cloud}
                colSpan={g.count}
                className="px-3 py-2 text-center border-l border-zinc-700"
              >
                <div className="text-xs font-semibold tracking-widest uppercase text-zinc-400">
                  {CLOUD_LABEL[g.cloud] ?? g.cloud}
                </div>
                <div className="mt-0.5 text-[10px] font-normal normal-case tracking-normal text-zinc-600">
                  {g.cloud === "aws"
                    ? AWS_METRIC_SUB[awsUsesSps ? "sps" : "eviction"]
                    : "Eviction rate"}
                </div>
              </th>
            ))}
          </tr>
          <tr className="bg-zinc-900 border-b border-zinc-700">
            {data.columns.map((col) => (
              <th key={col.key} className={COL_TH}>
                {col.region}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={row.gpu}
              className={`border-b border-zinc-800 ${i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/50"}`}
            >
              <td className="px-4 py-2 font-semibold text-zinc-200 whitespace-nowrap">
                {row.gpu}
              </td>
              {data.columns.map((col) => (
                <Cell
                  key={col.key}
                  data={row.cells[col.key]}
                  spsScore={
                    col.cloud === "aws"
                      ? spsScoreForCell(spsScores, col.region, row.gpu)
                      : undefined
                  }
                  gpu={row.gpu}
                  cloud={col.cloud}
                  region={col.region}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
