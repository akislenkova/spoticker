"use client";

import { useState } from "react";
import { MatrixData, CellData } from "@/lib/matrix";
import { CellColor, GpuLabel } from "@/lib/gpu-map";
import { formatRegion } from "@/lib/format-region";

const AWS_SPS_INSTANCE: Partial<Record<GpuLabel, string>> = {
  // GPU
  H200: "p5e.48xlarge",
  H100: "p5.48xlarge",
  "A100 80GB": "p4de.24xlarge",
  "A100 40GB": "p4d.24xlarge",
  L40S: "g6e.xlarge",
  L4: "g6.xlarge",
  A10G: "g5.xlarge",
  T4: "g4dn.xlarge",
  // CPU — pick a representative mid-range size for SPS
  "CPU (AMD)": "m7a.xlarge",
  "CPU (Intel)": "m7i.xlarge",
  "CPU (ARM)": "m7g.xlarge",
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

const CLOUD_LABEL: Record<string, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
  runpod: "RunPod",
  vast: "Vast.ai",
  coreweave: "CoreWeave",
  nebius: "Nebius",
};

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

function spsColor(score: number): CellColor {
  if (score >= 8) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

type RegionEntry = { region: string; cell: CellData; spsScore?: number };

function regionRows(
  data: MatrixData,
  gpu: GpuLabel,
  cloud: string,
  spsScores: Record<string, number>
): RegionEntry[] {
  const row = data.rows.find(r => r.gpu === gpu);
  if (!row) return [];
  return data.columns
    .filter(c => c.cloud === cloud)
    .map(col => ({
      region: col.region,
      cell: row.cells[col.key],
      spsScore: cloud === "aws" ? spsScoreForCell(spsScores, col.region, gpu) : undefined,
    }))
    .filter(e => e.cell.price !== null)
    .sort((a, b) => (a.cell.price as number) - (b.cell.price as number));
}

const SUMM_W = "w-[200px] min-w-[200px] max-w-[200px]";
const SUMM_TD = `${SUMM_W} p-1 align-top`;

function SummaryCell({
  gpu,
  cloud,
  data,
  spsScores,
  awsUsesSps,
  expanded,
  onToggle,
}: {
  gpu: GpuLabel;
  cloud: string;
  data: MatrixData;
  spsScores: Record<string, number>;
  awsUsesSps: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rows = regionRows(data, gpu, cloud, spsScores);

  if (rows.length === 0) {
    return (
      <td className={SUMM_TD}>
        <div className="w-full h-[86px] flex items-center justify-center rounded border border-[rgba(255,255,255,0.05)] bg-transparent">
          <span className="text-[#1e3028] text-xs font-mono">—</span>
        </div>
      </td>
    );
  }

  const best = rows[0];
  const usesSps = cloud === "aws" && awsUsesSps && best.spsScore != null;
  const color = usesSps ? spsColor(best.spsScore!) : best.cell.color;

  const metricText = usesSps
    ? `SPS ${best.spsScore}/10`
    : best.cell.evictionLabel
      ? `evict ${best.cell.evictionLabel}`
      : `${rows.length} region${rows.length !== 1 ? "s" : ""}`;

  return (
    <td className={SUMM_TD}>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className={[
          "w-full h-[86px] box-border flex flex-col justify-between",
          "rounded border px-2 py-1.5 text-left cursor-pointer",
          "transition-all duration-150 focus:outline-none",
          "focus-visible:ring-1 focus-visible:ring-[rgba(0,255,136,0.5)]",
          CELL_BG[color],
          CELL_HOVER[color],
          expanded ? "ring-1 ring-inset ring-[rgba(0,255,136,0.25)]" : "",
        ].join(" ")}
      >
        <div className={`font-mono text-sm font-semibold tabular-nums leading-tight ${PRICE_COLOR[color]}`}>
          ${best.cell.price!.toFixed(4)}
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`inline-block w-1.5 h-1.5 shrink-0 rounded-full ${DOT_COLOR[color]} ${DOT_GLOW[color]}`} />
          <span className="font-mono text-[10px] text-[#5e8a6e] truncate">
            {formatRegion(best.region)}
          </span>
        </div>
        <div className="flex items-center justify-between min-w-0 gap-1">
          <span className="font-mono text-[9px] text-[#3a5a48] truncate">{metricText}</span>
          <span
            className="font-mono text-[11px] text-[#3a5a48] shrink-0 transition-transform duration-150"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            ›
          </span>
        </div>
      </button>
    </td>
  );
}

function CloudPanel({
  gpu,
  cloud,
  data,
  spsScores,
  awsUsesSps,
}: {
  gpu: GpuLabel;
  cloud: string;
  data: MatrixData;
  spsScores: Record<string, number>;
  awsUsesSps: boolean;
}) {
  const rows = regionRows(data, gpu, cloud, spsScores);
  const usesSps = cloud === "aws" && awsUsesSps;

  const metricSubtitle =
    usesSps ? "Placement score (SPS)"
    : cloud === "azure" ? "Eviction rate"
    : cloud === "gcp" ? "Preemptible price"
    : cloud === "runpod" ? "Interrupt notice"
    : cloud === "vast" ? "Host reliability"
    : cloud === "coreweave" ? "Spot type"
    : cloud === "nebius" ? "Spot type"
    : "Eviction rate (advisor)";

  return (
    <div className="flex-1 min-w-[260px]">
      <div className="mb-2 pb-1.5 border-b border-[rgba(0,255,136,0.1)] flex items-baseline gap-2">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#5e8a6e]">
          {CLOUD_LABEL[cloud] ?? cloud}
        </span>
        <span className="font-mono text-[9px] text-[#2d4038]">{metricSubtitle}</span>
      </div>
      <table className="w-full border-separate border-spacing-y-px">
        <thead>
          <tr>
            <th className="text-left font-mono text-[9px] text-[#2d4038] uppercase tracking-wide pb-1 pr-4 font-normal">Region</th>
            <th className="text-right font-mono text-[9px] text-[#2d4038] uppercase tracking-wide pb-1 pr-4 font-normal">$/hr</th>
            <th className="text-left font-mono text-[9px] text-[#2d4038] uppercase tracking-wide pb-1 pr-4 font-normal">Instance</th>
            <th className="text-right font-mono text-[9px] text-[#2d4038] uppercase tracking-wide pb-1 font-normal">
              {usesSps ? "SPS" : "Evict"}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ region, cell, spsScore }) => {
            const eff = cloud === "aws" && awsUsesSps && spsScore != null;
            const color = eff ? spsColor(spsScore!) : cell.color;
            const metricText = eff ? `${spsScore}/10` : cell.evictionLabel ?? "—";

            return (
              <tr key={region} className={cell.href ? "group" : ""}>
                <td className="py-0.5 pr-4 whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block w-1 h-1 shrink-0 rounded-full ${DOT_COLOR[color]}`} />
                    {cell.href ? (
                      <a
                        href={cell.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline"
                      >
                        <span className="font-mono text-[10px] text-[#5e8a6e] group-hover:text-[#7aab8e] transition-colors">
                          {formatRegion(region)}
                          <span className="ml-0.5 text-[rgba(0,255,136,0.4)]">↗</span>
                        </span>
                      </a>
                    ) : (
                      <span className="font-mono text-[10px] text-[#5e8a6e]">{formatRegion(region)}</span>
                    )}
                  </span>
                </td>
                <td className={`py-0.5 pr-4 text-right font-mono text-[10px] tabular-nums ${PRICE_COLOR[color]}`}>
                  ${cell.price!.toFixed(4)}
                </td>
                <td className="py-0.5 pr-4 font-mono text-[9px] text-[#3a5a48] max-w-[130px] truncate" title={cell.instanceLabel}>
                  {cell.instanceLabel}
                </td>
                <td className={`py-0.5 text-right font-mono text-[10px] ${PRICE_COLOR[color]}`}>
                  {metricText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const AWS_METRIC_SUB: Record<"sps" | "eviction", string> = {
  sps: "Placement score (SPS)",
  eviction: "Eviction rate (advisor)",
};

const CLOUDS: Array<"aws" | "azure" | "gcp" | "runpod" | "vast" | "coreweave" | "nebius"> = [
  "aws",
  "azure",
  "gcp",
  "runpod",
  "vast",
  "coreweave",
  "nebius",
];

export default function PriceMatrix({
  data,
  spsScores = {},
  awsUsesSps = false,
}: {
  data: MatrixData;
  spsScores?: Record<string, number>;
  awsUsesSps?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(gpu: GpuLabel, cloud: string) {
    const key = `${gpu}::${cloud}`;
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const clouds = CLOUDS.filter(cloud => data.columns.some(c => c.cloud === cloud));
  const numCols = clouds.length + 1;

  return (
    <div className="overflow-x-auto rounded-lg border border-[rgba(0,255,136,0.1)] shadow-[0_0_40px_rgba(0,255,136,0.04)] backdrop-blur-sm">
      <table className="text-sm border-separate border-spacing-1 w-max">
        <thead>
          <tr className="bg-[rgba(2,10,7,0.95)]">
            <th className="px-4 py-3 text-left font-mono text-[10px] tracking-[0.2em] uppercase text-[#3a5a48] w-20">
              Type
            </th>
            {clouds.map(cloud => (
              <th
                key={cloud}
                className={`${SUMM_W} px-3 py-3 text-center border-l border-[rgba(0,255,136,0.07)]`}
              >
                <div className="font-mono text-xs font-semibold tracking-[0.2em] uppercase text-[#5e8a6e]">
                  {CLOUD_LABEL[cloud]}
                </div>
                <div className="mt-0.5 font-mono text-[9px] font-normal normal-case tracking-normal text-[#2d4038]">
                  {cloud === "aws"
                    ? AWS_METRIC_SUB[awsUsesSps ? "sps" : "eviction"]
                    : cloud === "gcp"
                      ? "Preemptible price"
                      : cloud === "runpod"
                        ? "Interrupt notice"
                        : cloud === "vast"
                          ? "Host reliability"
                          : cloud === "coreweave"
                            ? "Preemptible spot"
                            : cloud === "nebius"
                              ? "Preemptible spot"
                            : "Eviction rate"}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.flatMap((row, i) => {
            const expandedClouds = clouds.filter(cloud =>
              expanded.has(`${row.gpu}::${cloud}`)
            );
            const gpuRow = (
              <tr
                key={row.gpu}
                className={i % 2 === 0 ? "bg-[rgba(0,4,3,0.6)]" : "bg-[rgba(0,8,6,0.3)]"}
              >
                <td className="px-4 py-2 font-mono font-semibold text-[#7aab8e] whitespace-nowrap tracking-wide text-sm align-middle">
                  {row.gpu}
                </td>
                {clouds.map(cloud => (
                  <SummaryCell
                    key={cloud}
                    gpu={row.gpu}
                    cloud={cloud}
                    data={data}
                    spsScores={spsScores}
                    awsUsesSps={awsUsesSps}
                    expanded={expanded.has(`${row.gpu}::${cloud}`)}
                    onToggle={() => toggle(row.gpu, cloud)}
                  />
                ))}
              </tr>
            );

            if (expandedClouds.length === 0) return [gpuRow];

            const expansionRow = (
              <tr key={`${row.gpu}::expansion`}>
                <td
                  colSpan={numCols}
                  className="px-4 py-4 bg-[rgba(0,255,136,0.018)] border-t border-b border-[rgba(0,255,136,0.07)]"
                >
                  <div className="flex gap-10 flex-wrap">
                    {expandedClouds.map(cloud => (
                      <CloudPanel
                        key={cloud}
                        gpu={row.gpu}
                        cloud={cloud}
                        data={data}
                        spsScores={spsScores}
                        awsUsesSps={awsUsesSps}
                      />
                    ))}
                  </div>
                </td>
              </tr>
            );

            return [gpuRow, expansionRow];
          })}
        </tbody>
      </table>
    </div>
  );
}
