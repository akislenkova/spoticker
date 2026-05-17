"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";

const EXAMPLE_PROMPTS = [
  "I need 4× A100s for 8 h fine-tuning, batch job, can tolerate eviction",
  "Cheapest H100 spot in Europe for 48 h batch training",
  "T4 spot for cost-sensitive inference, need low eviction risk",
];

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

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  recommendation?: Recommendation;
  error?: string;
  loading?: boolean;
};

export default function RecommendationPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: trimmed },
      { id: assistantId, role: "assistant", text: "", loading: true },
    ]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                loading: false,
                text: res.ok ? (data.recommendation?.summary ?? "") : "",
                recommendation: res.ok ? data.recommendation : undefined,
                error: !res.ok ? (data.error ?? "Something went wrong.") : undefined,
              }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, loading: false, error: "Unable to connect to recommendation engine." }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-950/80 shadow-xl shadow-black/20 flex flex-col">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-zinc-800/60 flex items-center gap-3">
        <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-black flex-shrink-0">
          S
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-white leading-tight">Ask Spoticker</h2>
            <span className="rounded-full border border-emerald-800 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-400 tracking-wide">
              GBrain
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            GBrain agents have full context of live GPU spot pricing and eviction data — describe your workload and get an opinionated, risk-adjusted pick.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        className={`px-6 py-5 overflow-y-auto ${
          isEmpty
            ? "flex flex-col items-center justify-center min-h-[280px]"
            : "space-y-5 min-h-[180px] max-h-[540px]"
        }`}
      >
        {isEmpty ? (
          <div className="w-full max-w-lg space-y-5 text-center">
            <p className="text-zinc-400 text-sm font-medium">
              What GPU spot instance fits your workload?
            </p>
            <p className="text-zinc-600 text-xs -mt-2">
              GBrain agents read live pricing and eviction data across AWS and Azure to make the best call for your job.
            </p>
            <div className="flex flex-col gap-2">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-left text-xs text-zinc-400 hover:border-zinc-700 hover:text-zinc-200 transition"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold text-black mt-0.5">
                    S
                  </div>
                )}

                <div className={`max-w-[85%] ${msg.role === "user" ? "ml-auto" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="rounded-2xl bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 leading-relaxed">
                      {msg.text}
                    </div>
                  ) : msg.loading ? (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-500 flex items-center gap-2">
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" />
                      </span>
                      <span>Analyzing spot market…</span>
                    </div>
                  ) : msg.error ? (
                    <div className="rounded-2xl border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
                      {msg.error}
                    </div>
                  ) : msg.recommendation ? (
                    <RecommendationCard rec={msg.recommendation} />
                  ) : null}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-4 pt-2 border-t border-zinc-800/60">
        <div className="flex items-end gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 focus-within:border-emerald-500 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe your workload…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 outline-none max-h-32 leading-relaxed"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-black transition hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-700">
          Powered by GBrain · Enter ↵ to send · Shift+Enter for new line
        </p>
      </div>
    </section>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm">
      <div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-emerald-400 mb-1">
          Recommendation
        </div>
        <div className="font-semibold text-white">{rec.title}</div>
        <p className="mt-1 text-zinc-300 leading-relaxed">{rec.summary}</p>
      </div>

      <div className="rounded-xl bg-zinc-950/80 px-3 py-2.5 text-[13px] text-zinc-400 leading-relaxed">
        {rec.reasoning}
      </div>

      {rec.options.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {rec.options.map((opt) => (
            <div
              key={`${opt.cloud}-${opt.region}-${opt.gpu}`}
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"
            >
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">
                {opt.cloud.toUpperCase()}
              </div>
              <div className="mt-1 text-sm font-semibold text-white">{opt.gpu}</div>
              <div className="text-xs text-zinc-400">{opt.region}</div>
              <div className="mt-2 text-sm text-zinc-100">${opt.price.toFixed(4)}/GPU</div>
              <div className="mt-0.5 text-xs text-zinc-500">Risk: {opt.riskTier}</div>
              <div className="mt-1.5 text-[11px] text-zinc-600">
                {opt.evictionLabel ?? "No eviction data"}
              </div>
            </div>
          ))}
        </div>
      )}

      {rec.sources.length > 0 && (
        <div className="text-[11px] text-zinc-600">Sources: {rec.sources.join(", ")}</div>
      )}
    </div>
  );
}
