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

function spsColor(score: number): CellColor {
  if (score >= 8) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

function Cell({
  data,
  spsScore,
}: {
  data: CellData;
  spsScore?: number;
}) {
  if (data.price === null) {
    return (
      <td className="px-3 py-2 text-center">
        <div className="text-zinc-600 text-xs">—</div>
      </td>
    );
  }

  const color = spsScore != null ? spsColor(spsScore) : data.color;
  const label = spsScore != null
    ? `SPS ${spsScore}/10`
    : data.evictionLabel ?? null;

  return (
    <td className="px-2 py-1.5">
      <div className={`rounded border px-2 py-1.5 text-center min-w-[80px] ${CELL_BG[color]}`}>
        <div className="text-white font-mono text-sm font-medium">
          ${data.price.toFixed(4)}
        </div>
        {label ? (
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT[color]}`} />
            <span className="text-zinc-400 text-[10px]">{label}</span>
          </div>
        ) : (
          <div className="text-zinc-600 text-[10px] mt-0.5">no eviction data</div>
        )}
      </div>
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
      <table className="text-sm border-collapse w-full">
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
              <th
                key={col.key}
                className="px-3 py-1.5 text-center text-[11px] font-normal text-zinc-500 border-l border-zinc-700 whitespace-nowrap"
              >
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
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
