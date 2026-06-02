"use client";

import { useState } from "react";
import PlanDropZone from "@/components/PlanDropZone";
import PlanResultTabs, { type PlanResult } from "@/components/PlanResultTabs";
import Link from "next/link";

type Objective = "cost" | "cost_reliability" | "ha_multi_cloud";

const OBJECTIVES: { value: Objective; label: string; description: string }[] = [
  {
    value: "cost",
    label: "Lowest cost",
    description: "Cheapest spot available for your requirements.",
  },
  {
    value: "cost_reliability",
    label: "Cost + reliability",
    description: "Weighted blend: price matters, but not at the cost of high eviction.",
  },
  {
    value: "ha_multi_cloud",
    label: "Multi-cloud HA",
    description: "Top pick per cloud, minimum 2 clouds.",
  },
];

export default function PlanPage() {
  const [files, setFiles] = useState<{ name: string; content: string }[]>([]);
  const [objective, setObjective] = useState<Objective>("cost_reliability");
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    for (const f of files) {
      form.append("files", new Blob([f.content], { type: "text/plain" }), f.name);
    }
    form.append("objective", objective);
    if (intent.trim()) form.append("intent", intent.trim());

    try {
      const res = await fetch("/api/plan", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
      } else {
        setResult(data as PlanResult);
      }
    } catch {
      setError("Network error: could not reach the Plan service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-[900px] mx-auto space-y-6">

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="font-mono text-[10px] text-[rgba(0,255,136,0.4)] hover:text-[#00ff88] transition-colors tracking-widest uppercase"
            >
              ← Spoticker
            </Link>
            <span className="text-[rgba(0,255,136,0.2)]">/</span>
            <span className="font-mono text-[10px] tracking-widest uppercase text-[rgba(0,255,136,0.6)]">Plan Mode</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#c8f0dc]">
            Spot Placement Advisor
          </h1>
          <p className="font-mono text-sm text-[#4a6a58] max-w-xl leading-relaxed">
            &gt;_ Drop in a Dockerfile, k8s manifest, Helm values, or Terraform. Get a placement
            recommendation and a deployment-ready rewrite targeting the best spot instance.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Drop zone */}
          <div className="relative rounded-lg border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.9)] p-5 space-y-4">
            <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />

            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
              // 1. Upload your artifact
            </div>
            <PlanDropZone files={files} onFilesChange={setFiles} />
          </div>

          {/* Objective picker */}
          <div className="relative rounded-lg border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.9)] p-5 space-y-3">
            <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />

            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
              // 2. Objective
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {OBJECTIVES.map((obj) => (
                <label
                  key={obj.value}
                  className={`relative rounded border px-4 py-3 cursor-pointer transition-all ${
                    objective === obj.value
                      ? "border-[rgba(0,255,136,0.45)] bg-[rgba(0,255,136,0.07)]"
                      : "border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.6)] hover:border-[rgba(0,255,136,0.25)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="objective"
                    value={obj.value}
                    checked={objective === obj.value}
                    onChange={() => setObjective(obj.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="font-mono text-sm font-semibold text-[#c8f0dc]">{obj.label}</div>
                  <div className="mt-1 font-mono text-[11px] text-[#3a5a48] leading-relaxed">
                    {obj.description}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Intent (optional) */}
          <div className="relative rounded-lg border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.9)] p-5 space-y-3">
            <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />

            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)]">
              // 3. Intent <span className="text-[#2d4038]">(optional)</span>
            </div>
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="8-hour fine-tuning batch, can tolerate eviction, want cheapest spot in Europe…"
              rows={2}
              className="w-full rounded border border-[rgba(0,255,136,0.12)] bg-[rgba(0,4,3,0.7)] px-4 py-3 font-mono text-sm text-[#c8f0dc] placeholder:text-[#2d4038] outline-none resize-none focus:border-[rgba(0,255,136,0.35)] focus:shadow-[0_0_16px_rgba(0,255,136,0.08)] transition-all leading-relaxed"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={files.length === 0 || loading}
            className="w-full rounded border border-[rgba(0,255,136,0.4)] bg-[rgba(0,255,136,0.1)] py-3.5 font-mono text-sm font-semibold text-[#00ff88] tracking-widest uppercase hover:bg-[rgba(0,255,136,0.18)] hover:border-[rgba(0,255,136,0.6)] hover:shadow-[0_0_20px_rgba(0,255,136,0.15)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-bounce"
                      style={{ animationDelay: `${-0.3 + i * 0.15}s` }}
                    />
                  ))}
                </span>
                Analyzing…
              </span>
            ) : (
              "Analyze & plan →"
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="rounded border border-[rgba(255,50,80,0.25)] bg-[rgba(255,50,80,0.05)] px-5 py-4 font-mono text-sm text-[#d07080]">
            {error}
          </div>
        )}

        {/* Results */}
        {result && <PlanResultTabs result={result} />}

      </div>
    </main>
  );
}
