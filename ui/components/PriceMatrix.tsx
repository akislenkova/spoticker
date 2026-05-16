"use client";

import { MatrixData, CellData } from "@/lib/matrix";
import { CellColor } from "@/lib/gpu-map";

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

/** Fixed cell chrome so AWS/Azure boxes stay uniform despite long SKU names. */
const CELL_BOX =
  "w-[104px] h-[80px] flex flex-col items-center justify-center gap-0.5 rounded border px-2 py-1.5 text-center box-border";
const CELL_TD = "px-2 py-1.5 w-[104px] min-w-[104px] max-w-[104px] align-middle";
const COL_TH =
  "px-2 py-1.5 w-[104px] min-w-[104px] text-center text-[11px] font-normal text-zinc-500 border-l border-zinc-700 whitespace-nowrap";

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
  gpu: string;
  cloud: string;
  region: string;
}) {
  if (data.price === null) {
    return (
      <td className={CELL_TD}>
        <div className={`${CELL_BOX} border-zinc-800 bg-zinc-900/30`}>
          <span className="text-zinc-600 text-xs">—</span>
        </div>
      </td>
    );
  }

  const color = spsScore != null ? spsColor(spsScore) : data.color;
  const label = spsScore != null
    ? `SPS ${spsScore}/10`
    : data.evictionLabel ?? null;

  const cloudName = CLOUD_LABEL[cloud] ?? cloud;
  const ariaLabel = data.instanceLabel
    ? `Open ${gpu} spot in ${region} (${data.instanceLabel}) in ${cloudName} console`
    : `Open ${gpu} spot in ${region} in ${cloudName} console`;

  const evictionText = label ?? "no eviction data";
  const evictionMuted = label == null;

  const inner = (
    <div
      className={`${CELL_BOX} transition-colors ${CELL_BG[color]} ${
        data.href ? "hover:border-zinc-500 cursor-pointer" : ""
      }`}
    >
      <div className="h-5 flex items-center justify-center text-white font-mono text-sm font-medium leading-none">
        ${data.price.toFixed(4)}
      </div>
      <div className="h-4 flex items-center justify-center gap-1 w-full min-w-0">
        <span className={`inline-block w-1.5 h-1.5 shrink-0 rounded-full ${DOT[color]}`} />
        <span
          className={`text-[10px] leading-none truncate max-w-[88px] ${
            evictionMuted ? "text-zinc-600" : "text-zinc-400"
          }`}
        >
          {evictionText}
        </span>
      </div>
      <div
        className="h-3.5 w-full min-w-0 text-zinc-500 text-[9px] leading-none truncate px-0.5"
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
          className="block max-w-full no-underline text-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </td>
  );
}

export default function PriceMatrix({
  data,
  spsScores = {},
}: {
  data: MatrixData;
  spsScores?: Record<string, number>;
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
      <table className="text-sm border-collapse w-max">
        <thead>
          <tr className="bg-zinc-900 border-b border-zinc-700">
            <th className="px-4 py-2 text-left text-zinc-500 font-medium w-20" rowSpan={2}>
              GPU
            </th>
            {groups.map((g) => (
              <th
                key={g.cloud}
                colSpan={g.count}
                className="px-3 py-2 text-center text-xs font-semibold tracking-widest uppercase text-zinc-400 border-l border-zinc-700"
              >
                {CLOUD_LABEL[g.cloud] ?? g.cloud}
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
                  spsScore={col.cloud === "aws" ? spsScores[col.region] : undefined}
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
