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
    <section className="relative rounded-lg border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.9)] shadow-[0_0_40px_rgba(0,255,136,0.04)] backdrop-blur-sm flex flex-col">
      {/* Corner brackets */}
      <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
      <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />
      <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(0,255,136,0.35)] pointer-events-none" />
      <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(0,255,136,0.35)] pointer-events-none" />

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[rgba(0,255,136,0.07)] flex items-center gap-3">
        <div className="w-7 h-7 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-xs font-bold text-[#00ff88]">S</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-mono text-sm font-semibold text-[#c8f0dc] tracking-wider">
              // Ask Spoticker
            </h2>
            <span className="rounded border border-[rgba(0,212,255,0.2)] bg-[rgba(0,212,255,0.07)] px-2 py-0.5 font-mono text-[9px] font-medium text-[#00d4ff] tracking-widest uppercase">
              Agentic
            </span>
          </div>
          <p className="font-mono text-[11px] text-[#3a5a48] mt-0.5 leading-relaxed">
            Describe your workload — the agentic layer reads live spot pricing and eviction data to pick the best option for your job.
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        className={`px-6 py-5 overflow-y-auto ${
          isEmpty
            ? "flex flex-col items-center justify-center min-h-[260px]"
            : "space-y-5 min-h-[180px] max-h-[540px]"
        }`}
      >
        {isEmpty ? (
          <div className="w-full max-w-lg space-y-4 text-center">
            <p className="font-mono text-[#5e8a6e] text-sm">
              &gt;_ What GPU spot instance fits your workload?
            </p>
            <p className="font-mono text-[#2d4038] text-[11px] -mt-2">
              Live pricing and eviction data across AWS, Azure, and GCP — analyzed for your workload.
            </p>
            <div className="flex flex-col gap-2 text-left">
              {EXAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="group relative rounded border border-[rgba(0,255,136,0.08)] bg-[rgba(0,255,136,0.03)] px-4 py-3 text-left font-mono text-[11px] text-[#4a6a58] hover:border-[rgba(0,255,136,0.22)] hover:bg-[rgba(0,255,136,0.06)] hover:text-[#7aab8e] transition-all"
                >
                  <span className="text-[rgba(0,255,136,0.4)] mr-2">&gt;</span>{p}
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
                  <div className="flex-shrink-0 w-7 h-7 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] flex items-center justify-center mt-0.5">
                    <span className="font-mono text-xs font-bold text-[#00ff88]">S</span>
                  </div>
                )}

                <div className={`max-w-[85%] ${msg.role === "user" ? "ml-auto" : ""}`}>
                  {msg.role === "user" ? (
                    <div className="rounded border border-[rgba(0,255,136,0.12)] bg-[rgba(0,255,136,0.05)] px-4 py-2.5 font-mono text-sm text-[#c8f0dc] leading-relaxed">
                      <span className="text-[rgba(0,255,136,0.5)] mr-2">&gt;</span>{msg.text}
                    </div>
                  ) : msg.loading ? (
                    <div className="rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.8)] px-4 py-3 font-mono text-sm text-[#3a5a48] flex items-center gap-2">
                      <span className="inline-flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-bounce" />
                      </span>
                      <span>Analyzing spot market…</span>
                    </div>
                  ) : msg.error ? (
                    <div className="rounded border border-[rgba(255,50,80,0.25)] bg-[rgba(255,50,80,0.05)] px-4 py-3 font-mono text-sm text-[#d07080]">
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
      <div className="px-4 pb-4 pt-2 border-t border-[rgba(0,255,136,0.07)]">
        <div className="flex items-end gap-3 rounded border border-[rgba(0,255,136,0.12)] bg-[rgba(0,4,3,0.7)] px-4 py-3 focus-within:border-[rgba(0,255,136,0.35)] focus-within:shadow-[0_0_16px_rgba(0,255,136,0.08)] transition-all">
          <span className="font-mono text-sm text-[rgba(0,255,136,0.5)] flex-shrink-0 pb-0.5">&gt;_</span>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe your workload…"
            rows={1}
            className="flex-1 resize-none bg-transparent font-mono text-sm text-[#c8f0dc] placeholder:text-[#2d4038] outline-none max-h-32 leading-relaxed"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-8 h-8 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.1)] flex items-center justify-center text-[#00ff88] hover:bg-[rgba(0,255,136,0.2)] hover:border-[rgba(0,255,136,0.5)] hover:shadow-[0_0_10px_rgba(0,255,136,0.2)] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Send"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center font-mono text-[10px] text-[#1e3028] tracking-wider">
          Enter ↵ to send · Shift+Enter for new line
        </p>
      </div>
    </section>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="space-y-3 rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(3,12,9,0.9)] p-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-[rgba(0,255,136,0.5)] mb-1">
          // Recommendation
        </div>
        <div className="font-semibold text-[#c8f0dc] text-sm">{rec.title}</div>
        <p className="mt-1 text-[#7aab8e] text-sm leading-relaxed font-mono">{rec.summary}</p>
      </div>

      <div className="rounded border border-[rgba(0,255,136,0.07)] bg-[rgba(0,4,3,0.8)] px-3 py-2.5 font-mono text-[12px] text-[#4a6a58] leading-relaxed">
        {rec.reasoning}
      </div>

      {rec.options.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {rec.options.map((opt) => (
            <div
              key={`${opt.cloud}-${opt.region}-${opt.gpu}`}
              className="rounded border border-[rgba(0,255,136,0.09)] bg-[rgba(0,4,3,0.7)] p-3"
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#2d4038]">
                {opt.cloud}
              </div>
              <div className="mt-1 font-mono text-sm font-semibold text-[#00ff88]">{opt.gpu}</div>
              <div className="font-mono text-[11px] text-[#4a6a58]">{opt.region}</div>
              <div className="mt-2 font-mono text-sm text-[#a0dfc0]">${opt.price.toFixed(4)}/GPU</div>
              <div className="mt-0.5 font-mono text-[10px] text-[#3a5a48]">Risk: {opt.riskTier}</div>
              <div className="mt-1.5 font-mono text-[10px] text-[#2d4038]">
                {opt.evictionLabel ?? "No eviction data"}
              </div>
            </div>
          ))}
        </div>
      )}

      {rec.sources.length > 0 && (
        <div className="font-mono text-[10px] text-[#1e3028]">
          Sources: {rec.sources.join(", ")}
        </div>
      )}
    </div>
  );
}
