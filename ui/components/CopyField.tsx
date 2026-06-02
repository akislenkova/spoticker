"use client";

import { useState } from "react";

export default function CopyField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(0,4,3,0.7)] p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] text-[#2d4038] uppercase tracking-[0.2em]">{label}</p>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className={`font-mono text-[10px] px-2 py-1 rounded border transition-all disabled:opacity-40 ${
            copied
              ? "border-[rgba(0,255,136,0.35)] bg-[rgba(0,255,136,0.1)] text-[#00ff88]"
              : "border-[rgba(0,255,136,0.12)] text-[#3a5a48] hover:text-[rgba(0,255,136,0.7)] hover:border-[rgba(0,255,136,0.25)]"
          }`}
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <code className="block font-mono text-sm text-[#00ff88] break-all">{value || "-"}</code>
      {hint && <p className="font-mono text-[10px] text-[#1e3028]">{hint}</p>}
    </div>
  );
}
