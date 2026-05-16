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
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
        <button
          type="button"
          onClick={copy}
          disabled={!value}
          className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="block text-sm text-emerald-400 break-all font-mono">{value || "—"}</code>
      {hint && <p className="text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}
