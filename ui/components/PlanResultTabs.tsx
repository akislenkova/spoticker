"use client";

import { useState } from "react";

// ── Type mirror of Python PlanResult ──────────────────────────────────────────

type FieldConfidence = "explicit" | "inferred" | "unknown";

type ExtractedSpec = {
  source_type: string;
  workload: { kind: string; image: string | null; command: string[]; env: Record<string, string> };
  resources: { gpu_count: number | null; gpu_type: string | null; cpu_request: string | null; memory_request: string | null; replicas: number };
  scheduling: { use_spot: boolean | null };
  extraction_confidence: Record<string, FieldConfidence>;
  missing_fields: string[];
  inference_notes: Record<string, string>;
  still_unknown: string[];
  duration_hours: number | null;
};

type PlacementCandidate = {
  cloud: string;
  region: string;
  sku: string;
  gpu_type: string;
  gpu_count: number;
  hourly_price: number;
  eviction_rate_pct: number | null;
  eviction_confidence: "high" | "low";
  estimated_total: number | null;
  estimated_savings_vs_ondemand: number | null;
  savings_pct: number | null;
  rationale: string[];
  ondemand_url: string | null;
};

type RewriteResult = {
  unified_diff: string;
  additions: { field: string; value: unknown; reason: string }[];
  warnings: string[];
  migration_commands: string[];
  validation_failed: boolean;
  validator_output: string | null;
};

export type PlanResult = {
  spec: ExtractedSpec;
  candidates: PlacementCandidate[];
  chosen: PlacementCandidate | null;
  rewrite: RewriteResult | null;
  validation_passed: boolean;
  error: string | null;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidencePill({ level }: { level: FieldConfidence }) {
  const styles: Record<FieldConfidence, string> = {
    explicit: "border-[rgba(0,255,136,0.35)] text-[#00ff88] bg-[rgba(0,255,136,0.08)]",
    inferred: "border-[rgba(0,212,255,0.3)] text-[#00d4ff] bg-[rgba(0,212,255,0.07)]",
    unknown:  "border-[rgba(255,136,0,0.3)] text-[#ffaa00] bg-[rgba(255,136,0,0.07)]",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${styles[level]}`}>
      {level}
    </span>
  );
}

function CloudBadge({ cloud }: { cloud: string }) {
  const colors: Record<string, string> = {
    aws:   "text-[#ff9900] border-[rgba(255,153,0,0.3)] bg-[rgba(255,153,0,0.07)]",
    azure: "text-[#00a4ef] border-[rgba(0,164,239,0.3)] bg-[rgba(0,164,239,0.07)]",
    gcp:   "text-[#34a853] border-[rgba(52,168,83,0.3)] bg-[rgba(52,168,83,0.07)]",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest ${colors[cloud] ?? "text-[#7aab8e] border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.05)]"}`}>
      {cloud}
    </span>
  );
}

function EvictionPill({ pct, confidence }: { pct: number | null; confidence: "high" | "low" }) {
  if (pct === null) {
    return <span className="font-mono text-[11px] text-[#2d4038]">eviction unknown</span>;
  }
  const color = pct < 5 ? "text-[#00ff88]" : pct < 15 ? "text-[#ffaa00]" : "text-[#d07080]";
  return (
    <span className={`font-mono text-[11px] ${color}`}>
      {pct}% eviction{confidence === "low" ? " ·est" : ""}
    </span>
  );
}

// ── Tab: Report ───────────────────────────────────────────────────────────────

function ReportTab({ result }: { result: PlanResult }) {
  const { spec, candidates, chosen } = result;

  return (
    <div className="space-y-6">
      {/* Workload summary */}
      <section className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
          // Workload
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ["Source", spec.source_type],
            ["Kind", spec.workload.kind],
            ["Image", spec.workload.image ?? "—"],
            ["GPU request", spec.resources.gpu_count != null ? `${spec.resources.gpu_count}× ${spec.resources.gpu_type ?? "?"}` : "—"],
            ["Memory", spec.resources.memory_request ?? "—"],
            ["Replicas", String(spec.resources.replicas)],
            ["Spot", spec.scheduling.use_spot === null ? "not specified" : spec.scheduling.use_spot ? "yes" : "no"],
          ].map(([label, val]) => (
            <div key={label} className="flex items-start gap-2">
              <span className="font-mono text-[11px] text-[#3a5a48] w-24 flex-shrink-0">{label}</span>
              <span className="font-mono text-[11px] text-[#7aab8e] break-all">{val}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Confidence map */}
      {Object.keys(spec.extraction_confidence).length > 0 && (
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
            // Field confidence
          </div>
          <div className="rounded border border-[rgba(0,255,136,0.07)] bg-[rgba(3,12,9,0.8)] p-3 space-y-1.5">
            {Object.entries(spec.extraction_confidence).map(([field, conf]) => (
              <div key={field} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[#4a6a58] flex-1">{field}</span>
                <ConfidencePill level={conf} />
                {spec.inference_notes[field] && (
                  <span className="font-mono text-[10px] text-[#2d4038] max-w-xs truncate">
                    {spec.inference_notes[field]}
                  </span>
                )}
              </div>
            ))}
            {spec.still_unknown.map((f) => (
              <div key={f} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[#4a6a58] flex-1">{f}</span>
                <ConfidencePill level="unknown" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Candidates */}
      {candidates.length > 0 && (
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
            // Top candidates
          </div>
          <div className="space-y-2">
            {candidates.map((c, i) => (
              <div
                key={`${c.cloud}-${c.region}-${c.sku}`}
                className={`rounded border p-3 ${
                  i === 0
                    ? "border-[rgba(0,255,136,0.25)] bg-[rgba(0,255,136,0.04)]"
                    : "border-[rgba(0,255,136,0.08)] bg-[rgba(3,12,9,0.6)]"
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {i === 0 && (
                    <span className="rounded border border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.1)] px-1.5 py-0.5 font-mono text-[9px] text-[#00ff88] uppercase tracking-widest">
                      #1 pick
                    </span>
                  )}
                  <CloudBadge cloud={c.cloud} />
                  <span className="font-mono text-sm font-semibold text-[#c8f0dc]">
                    {c.gpu_count}× {c.gpu_type}
                  </span>
                  <span className="font-mono text-[11px] text-[#4a6a58]">{c.region}</span>
                  <span className="font-mono text-[11px] text-[#3a5a48]">{c.sku}</span>
                </div>
                <div className="mt-2 flex items-center gap-4 flex-wrap">
                  <span className="font-mono text-sm text-[#00ff88]">
                    ${c.hourly_price.toFixed(4)}/hr
                  </span>
                  {c.estimated_total != null && (
                    <span className="font-mono text-[11px] text-[#4a6a58]">
                      ~${c.estimated_total.toFixed(2)} total
                    </span>
                  )}
                  {c.savings_pct != null && (
                    <span className="font-mono text-[11px] text-[#34a853]">
                      {c.savings_pct}% vs on-demand
                    </span>
                  )}
                  <EvictionPill pct={c.eviction_rate_pct} confidence={c.eviction_confidence} />
                </div>
                {c.rationale.length > 0 && (
                  <div className="mt-1.5 font-mono text-[10px] text-[#2d4038] leading-relaxed">
                    {c.rationale.join(" · ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Tab: Diff ─────────────────────────────────────────────────────────────────

function DiffTab({ result }: { result: PlanResult }) {
  const { rewrite } = result;

  if (!rewrite) {
    return (
      <p className="font-mono text-sm text-[#3a5a48]">No rewrite generated.</p>
    );
  }

  const lines = rewrite.unified_diff.split("\n");

  return (
    <div className="space-y-4">
      {rewrite.warnings.length > 0 && (
        <div className="rounded border border-[rgba(255,136,0,0.25)] bg-[rgba(255,136,0,0.05)] p-3 space-y-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(255,136,0,0.7)]">// Warnings</div>
          {rewrite.warnings.map((w, i) => (
            <p key={i} className="font-mono text-xs text-[#ffaa00]">⚠ {w}</p>
          ))}
        </div>
      )}

      {rewrite.validation_failed && (
        <div className="rounded border border-[rgba(255,50,80,0.25)] bg-[rgba(255,50,80,0.04)] px-3 py-2">
          <span className="font-mono text-xs text-[#d07080]">
            Validation failed — review diff manually before applying.
          </span>
          {rewrite.validator_output && (
            <pre className="mt-2 font-mono text-[10px] text-[#2d4038] whitespace-pre-wrap overflow-x-auto">
              {rewrite.validator_output}
            </pre>
          )}
        </div>
      )}

      {rewrite.unified_diff ? (
        <pre className="rounded border border-[rgba(0,255,136,0.08)] bg-[rgba(3,12,9,0.9)] p-4 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[520px] overflow-y-auto">
          {lines.map((line, i) => {
            const color =
              line.startsWith("+") && !line.startsWith("+++")
                ? "text-[#34a853]"
                : line.startsWith("-") && !line.startsWith("---")
                ? "text-[#d07080]"
                : line.startsWith("@@")
                ? "text-[#00d4ff]"
                : "text-[#4a6a58]";
            return (
              <span key={i} className={`block ${color}`}>
                {line}
              </span>
            );
          })}
        </pre>
      ) : (
        <p className="font-mono text-sm text-[#3a5a48]">No changes needed.</p>
      )}

      {rewrite.additions.length > 0 && (
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">// New fields added</div>
          {rewrite.additions.map((a, i) => (
            <div key={i} className="rounded border border-[rgba(0,255,136,0.08)] bg-[rgba(3,12,9,0.6)] px-3 py-2 font-mono text-[11px]">
              <span className="text-[#34a853]">{a.field}</span>
              <span className="text-[#3a5a48] mx-2">→</span>
              <span className="text-[#7aab8e]">{String(a.value)}</span>
              <span className="text-[#2d4038] ml-2">// {a.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Migration plan ───────────────────────────────────────────────────────

function MigrationTab({ result }: { result: PlanResult }) {
  const { rewrite, chosen } = result;
  const [copied, setCopied] = useState<number | null>(null);

  function copy(cmd: string, idx: number) {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(idx);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  if (!chosen) {
    return <p className="font-mono text-sm text-[#3a5a48]">No placement chosen.</p>;
  }

  const commands = rewrite?.migration_commands ?? [];

  return (
    <div className="space-y-6">
      {/* Chosen placement summary */}
      <div className="rounded border border-[rgba(0,255,136,0.18)] bg-[rgba(0,255,136,0.04)] p-4 space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">// Chosen placement</div>
        <div className="flex items-center gap-3 flex-wrap">
          <CloudBadge cloud={chosen.cloud} />
          <span className="font-mono text-base font-semibold text-[#c8f0dc]">
            {chosen.gpu_count}× {chosen.gpu_type}
          </span>
          <span className="font-mono text-sm text-[#4a6a58]">{chosen.region} · {chosen.sku}</span>
        </div>
        <div className="flex gap-4 flex-wrap text-sm font-mono">
          <span className="text-[#00ff88]">${chosen.hourly_price.toFixed(4)}/hr</span>
          {chosen.savings_pct != null && (
            <span className="text-[#34a853]">{chosen.savings_pct}% below on-demand</span>
          )}
          <EvictionPill pct={chosen.eviction_rate_pct} confidence={chosen.eviction_confidence} />
        </div>
      </div>

      {/* Commands */}
      {commands.length > 0 ? (
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
            // Migration commands (run in order)
          </div>
          {commands.map((cmd, i) => (
            <div
              key={i}
              className="group relative rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.8)] px-4 py-3 flex items-start gap-3"
            >
              <span className="font-mono text-[10px] text-[#2d4038] w-5 flex-shrink-0 mt-0.5">{i + 1}.</span>
              <code className="flex-1 font-mono text-sm text-[#7aab8e] break-all leading-relaxed">{cmd}</code>
              <button
                onClick={() => copy(cmd, i)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded border border-[rgba(0,255,136,0.2)] bg-[rgba(0,255,136,0.06)] px-2 py-1 font-mono text-[10px] text-[#00ff88]"
              >
                {copied === i ? "copied" : "copy"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-mono text-sm text-[#3a5a48]">No migration commands generated.</p>
      )}

      {/* Checklist */}
      <div className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
          // Pre-flight checklist
        </div>
        <div className="rounded border border-[rgba(0,255,136,0.07)] bg-[rgba(3,12,9,0.7)] p-4 space-y-2 font-mono text-xs text-[#4a6a58]">
          {[
            "Review the diff in the Diff tab — never apply blindly",
            "Ensure your workload handles spot eviction (checkpoint, graceful shutdown hook)",
            result.spec.resources.replicas > 1
              ? "PodDisruptionBudget should be included — verify in the diff"
              : "Single replica — consider minAvailable PDB if this becomes multi-replica",
            "Set a node affinity / toleration matching the target instance family",
            "Validate with kubeval / kubeconform before applying to production",
            chosen.eviction_confidence === "low"
              ? "Eviction data unavailable for this region — monitor closely after deploy"
              : `Eviction rate ${chosen.eviction_rate_pct ?? "?"}% — within acceptable range`,
          ].map((item, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-[rgba(0,255,136,0.4)] flex-shrink-0">□</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const TABS = ["Report", "Diff", "Migration plan"] as const;
type Tab = (typeof TABS)[number];

export default function PlanResultTabs({ result }: { result: PlanResult }) {
  const [active, setActive] = useState<Tab>("Report");

  return (
    <div className="relative rounded-lg border border-[rgba(0,255,136,0.12)] bg-[rgba(3,12,9,0.92)] shadow-[0_0_40px_rgba(0,255,136,0.04)] backdrop-blur-sm">
      {/* Corner brackets */}
      {["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r",
        "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map((cls) => (
        <span key={cls} className={`absolute w-3 h-3 border-[rgba(0,255,136,0.35)] pointer-events-none ${cls}`} />
      ))}

      {/* Tab bar */}
      <div className="flex border-b border-[rgba(0,255,136,0.08)] px-4 pt-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`px-4 pb-3 font-mono text-xs tracking-wider transition-colors ${
              active === tab
                ? "text-[#00ff88] border-b border-[#00ff88]"
                : "text-[#3a5a48] hover:text-[#7aab8e]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="p-5">
        {active === "Report" && <ReportTab result={result} />}
        {active === "Diff" && <DiffTab result={result} />}
        {active === "Migration plan" && <MigrationTab result={result} />}
      </div>
    </div>
  );
}
