"use client";

import { MatrixData, CellData } from "@/lib/matrix";
import { CellColor, GpuLabel } from "@/lib/gpu-map";
import { formatRegion } from "@/lib/format-region";

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
  green:  "bg-[rgba(0,255,136,0.05)] border-[rgba(0,255,136,0.22)]",
  yellow: "bg-[rgba(255,190,0,0.05)] border-[rgba(255,190,0,0.2)]",
  red:    "bg-[rgba(255,50,80,0.05)] border-[rgba(255,50,80,0.18)]",
  gray:   "bg-[rgba(255,255,255,0.015)] border-[rgba(255,255,255,0.06)]",
};

const CELL_HOVER: Record<CellColor, string> = {
  green:  "hover:border-[rgba(0,255,136,0.45)] hover:bg-[rgba(0,255,136,0.08)]",
  yellow: "hover:border-[rgba(255,190,0,0.4)] hover:bg-[rgba(255,190,0,0.08)]",
  red:    "hover:border-[rgba(255,50,80,0.38)] hover:bg-[rgba(255,50,80,0.08)]",
  gray:   "hover:border-[rgba(255,255,255,0.12)]",
};

const DOT_COLOR: Record<CellColor, string> = {
  green:  "bg-[#00ff88]",
  yellow: "bg-[#ffc200]",
  red:    "bg-[#ff4060]",
  gray:   "bg-[#2d4038]",
};

const DOT_GLOW: Record<CellColor, string> = {
  green:  "shadow-[0_0_5px_rgba(0,255,136,0.8)]",
  yellow: "shadow-[0_0_5px_rgba(255,194,0,0.8)]",
  red:    "shadow-[0_0_5px_rgba(255,64,96,0.8)]",
  gray:   "",
};

const PRICE_COLOR: Record<CellColor, string> = {
  green:  "text-[#a0dfc0]",
  yellow: "text-[#d4b060]",
  red:    "text-[#d07080]",
  gray:   "text-[#4a6a58]",
};

const COL_W = "w-[116px] min-w-[116px] max-w-[116px]";
const CELL_TD = `${COL_W} p-1 align-middle`;
const CELL_BOX =
  "w-full h-[78px] box-border flex flex-col justify-between gap-0 rounded border px-1.5 py-1 text-center overflow-hidden transition-all duration-150";
const CELL_BOX_EMPTY =
  "w-full h-[78px] box-border flex flex-col items-center justify-center rounded border px-1.5 py-1 text-center";
const COL_TH =
  `${COL_W} p-1 text-center text-[10px] font-mono font-normal text-[#3a5a48] border-l border-[rgba(0,255,136,0.07)] tracking-wide uppercase leading-snug break-words`;

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
        <div className={`${CELL_BOX_EMPTY} border-[rgba(255,255,255,0.05)] bg-transparent`}>
          <span className="text-[#1e3028] text-xs">—</span>
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
    ? { label: "SPS", className: "bg-[rgba(0,212,255,0.1)] text-[#00d4ff] border border-[rgba(0,212,255,0.2)]" }
    : cloud === "azure"
      ? { label: "EVICT", className: "bg-[rgba(255,149,0,0.1)] text-[#ff9500] border border-[rgba(255,149,0,0.2)]" }
      : evictionLabel
        ? { label: "EVICT", className: "bg-[rgba(255,255,255,0.04)] text-[#4a6a58] border border-[rgba(255,255,255,0.08)]" }
        : null;

  const primaryText = usesSps
    ? `${spsScore}/10`
    : evictionLabel
      ? evictionLabel
      : "no data";
  const primaryMuted = !usesSps && evictionLabel == null;
  const showEvictionSub = usesSps && evictionLabel != null;

  const inner = (
    <div className={`${CELL_BOX} ${CELL_BG[color]} ${data.href ? CELL_HOVER[color] + " cursor-pointer" : ""}`}>
      {/* Price */}
      <div className={`shrink-0 font-mono text-sm font-semibold leading-tight tabular-nums ${PRICE_COLOR[color]}`}>
        ${data.price.toFixed(4)}
      </div>

      {/* Metric row */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 min-w-0 px-0.5">
        <div className="flex items-center justify-center gap-1 w-full">
          <span className={`inline-block w-1.5 h-1.5 shrink-0 rounded-full ${DOT_COLOR[color]} ${DOT_GLOW[color]}`} />
          {metricBadge ? (
            <span className={`shrink-0 rounded px-0.5 text-[8px] font-mono font-semibold uppercase tracking-wide ${metricBadge.className}`}>
              {metricBadge.label}
            </span>
          ) : null}
          <span className={`font-mono text-[10px] leading-tight truncate ${primaryMuted ? "text-[#2d4038]" : "text-[#5e8a6e]"}`}>
            {primaryText}
          </span>
        </div>
        {showEvictionSub && (
          <span className="font-mono text-[9px] leading-tight text-[#2d4038] truncate w-full">
            advisor evict {evictionLabel}
          </span>
        )}
      </div>

      {/* Instance label */}
      <div
        className="shrink-0 min-h-[12px] w-full min-w-0 font-mono text-[#2d4038] text-[9px] leading-tight truncate"
        title={data.instanceLabel}
      >
        {data.instanceLabel ? (
          <>
            {data.instanceLabel}
            {data.href ? <span className="ml-0.5 text-[rgba(0,255,136,0.4)]">↗</span> : null}
          </>
        ) : (
          <span className="invisible" aria-hidden>—</span>
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
          className="block w-full no-underline text-inherit focus:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(0,255,136,0.5)] rounded"
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
    <div className="overflow-x-auto rounded-lg border border-[rgba(0,255,136,0.1)] shadow-[0_0_40px_rgba(0,255,136,0.04)] backdrop-blur-sm">
      <table className="text-sm border-separate border-spacing-1 w-max">
        <thead>
          <tr className="bg-[rgba(2,10,7,0.95)]">
            <th
              className="px-4 py-2 text-left font-mono text-[10px] tracking-[0.2em] uppercase text-[#3a5a48] w-20"
              rowSpan={2}
            >
              GPU
            </th>
            {groups.map((g) => (
              <th
                key={g.cloud}
                colSpan={g.count}
                className="px-3 py-2 text-center border-l border-[rgba(0,255,136,0.07)]"
              >
                <div className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-[#5e8a6e]">
                  {CLOUD_LABEL[g.cloud] ?? g.cloud}
                </div>
                <div className="mt-0.5 font-mono text-[9px] font-normal normal-case tracking-normal text-[#2d4038]">
                  {g.cloud === "aws"
                    ? AWS_METRIC_SUB[awsUsesSps ? "sps" : "eviction"]
                    : "Eviction rate"}
                </div>
              </th>
            ))}
          </tr>
          <tr className="bg-[rgba(2,10,7,0.95)]">
            {data.columns.map((col) => (
              <th key={col.key} className={COL_TH}>
                {formatRegion(col.region)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={row.gpu}
              className={i % 2 === 0 ? "bg-[rgba(0,4,3,0.6)]" : "bg-[rgba(0,8,6,0.3)]"}
            >
              <td className="px-4 py-2 font-mono font-semibold text-[#7aab8e] whitespace-nowrap tracking-wide text-sm">
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
