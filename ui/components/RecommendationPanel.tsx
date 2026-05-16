"use client";

import { useState, type FormEvent } from "react";

type RecommendationOption = {
  cloud: string;
  region: string;
  gpu: string;
  price: number;
  evictionLabel: string | null;
  riskTier: string;
  source: string;
  lastUpdated: string;
  details: string;
};

type Recommendation = {
  title: string;
  summary: string;
  reasoning: string;
  sources: string[];
  options: RecommendationOption[];
};

export default function RecommendationPanel() {
  const [prompt, setPrompt] = useState(
    "I need 4x A100s for 8 hours of fine-tuning, batch job, can tolerate eviction"
  );
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setRecommendation(null);
    setLoading(true);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to fetch recommendation.");
      } else {
        setRecommendation(data.recommendation);
      }
    } catch (err) {
      setError("Unable to connect to recommendation engine.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">Ask Spotticker</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Enter a workload description and get a risk-adjusted GPU spot recommendation.
          </p>
        </div>
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
          Hackathon demo
        </span>
      </div>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="block text-[13px] font-medium text-zinc-300">
          Workload prompt
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="mt-2 h-28 w-full rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white outline-none transition hover:border-zinc-700 focus:border-emerald-500"
          />
        </label>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-zinc-500">
            Example: <span className="text-white">4x A100s, 8hr fine-tune, batch job, can tolerate eviction</span>
          </p>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Thinking…" : "Ask Spotticker"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {recommendation ? (
        <div className="mt-4 space-y-4 rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
          <div className="space-y-2">
            <div className="text-sm uppercase tracking-[0.22em] text-emerald-400">Recommendation</div>
            <h3 className="text-xl font-semibold text-white">{recommendation.title}</h3>
            <p className="text-sm text-zinc-300">{recommendation.summary}</p>
          </div>

          <div className="rounded-3xl bg-zinc-950/90 p-4 text-sm text-zinc-300">
            {recommendation.reasoning}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {recommendation.options.map((option) => (
              <div key={`${option.cloud}-${option.region}-${option.gpu}`} className="rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{option.cloud.toUpperCase()}</div>
                <div className="mt-2 text-sm font-semibold text-white">{option.gpu}</div>
                <div className="text-sm text-zinc-400">{option.region}</div>
                <div className="mt-3 text-sm text-zinc-100">${option.price.toFixed(4)}/GPU</div>
                <div className="mt-1 text-xs text-zinc-400">Risk: {option.riskTier}</div>
                <div className="mt-2 text-[13px] text-zinc-500">{option.evictionLabel ?? "No eviction data"}</div>
              </div>
            ))}
          </div>

          <div className="text-xs text-zinc-500">
            Sources: {recommendation.sources.join(", ")}
          </div>
        </div>
      ) : null}
    </section>
  );
}
