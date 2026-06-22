"use client";

import { useState } from "react";

export default function CodeBlock({
  label,
  code,
}: {
  label?: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="relative rounded border border-[rgba(0,255,136,0.12)] bg-[rgba(0,4,3,0.85)]">
      <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[rgba(0,255,136,0.25)] pointer-events-none" />
      <span className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[rgba(0,255,136,0.25)] pointer-events-none" />
      <span className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[rgba(0,255,136,0.25)] pointer-events-none" />
      <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[rgba(0,255,136,0.25)] pointer-events-none" />

      <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(0,255,136,0.07)]">
        {label ? (
          <span className="font-mono text-[10px] text-[#2d4038] tracking-[0.2em] uppercase">
            {label}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={copy}
          className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-all ${
            copied
              ? "border-[rgba(0,255,136,0.35)] bg-[rgba(0,255,136,0.08)] text-[#00ff88]"
              : "border-[rgba(0,255,136,0.12)] text-[#3a5a48] hover:text-[rgba(0,255,136,0.65)] hover:border-[rgba(0,255,136,0.25)]"
          }`}
        >
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>

      <pre className="px-4 py-3 font-mono text-xs text-[#8ec4a6] overflow-x-auto leading-relaxed whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
