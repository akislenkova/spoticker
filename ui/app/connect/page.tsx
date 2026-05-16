"use client";

import { useState } from "react";

const SPOTTICKER_ACCOUNT_ID = process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID ?? "YOUR_ACCOUNT_ID";
const TEMPLATE_URL = process.env.NEXT_PUBLIC_CF_TEMPLATE_URL ?? "";

type Step = "init" | "launching" | "pasting" | "verifying" | "done" | "error";

function cfUrl(externalId: string) {
  const params = new URLSearchParams({
    templateURL: TEMPLATE_URL,
    stackName: "SpottickerReadOnly",
    param_SpottickerAccountId: SPOTTICKER_ACCOUNT_ID,
    param_ExternalId: externalId,
  });
  return `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review?${params}`;
}

export default function ConnectPage() {
  const [step, setStep] = useState<Step>("init");
  const [connectionId, setConnectionId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [roleArn, setRoleArn] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleStart() {
    setStep("launching");
    const resp = await fetch("/api/aws/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init" }),
    });
    const data = await resp.json();
    if (!resp.ok) { setErrorMsg(data.error); setStep("error"); return; }
    setConnectionId(data.id);
    setExternalId(data.external_id);
    setStep("pasting");
  }

  async function handleVerify() {
    setStep("verifying");
    const resp = await fetch("/api/aws/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", id: connectionId, role_arn: roleArn }),
    });
    const data = await resp.json();
    if (!resp.ok) { setErrorMsg(data.error); setStep("error"); return; }
    // Redirect to matrix with connection ID in URL
    window.location.href = `/?cid=${connectionId}`;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connect AWS Account</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Spoticker assumes a read-only role in your account — your access keys never leave AWS.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 text-xs">
          {(["Launch", "Paste ARN", "Verify"] as const).map((label, i) => {
            const active =
              (i === 0 && (step === "init" || step === "launching")) ||
              (i === 1 && step === "pasting") ||
              (i === 2 && (step === "verifying" || step === "done"));
            return (
              <span
                key={label}
                className={`px-2 py-1 rounded ${active ? "bg-zinc-700 text-zinc-100" : "text-zinc-600"}`}
              >
                {i + 1}. {label}
              </span>
            );
          })}
        </div>

        {step === "init" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              We'll generate a unique External ID for your account, then open AWS CloudFormation
              to deploy a read-only role. Takes about 30 seconds.
            </p>
            <button
              onClick={handleStart}
              className="w-full py-2.5 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
            >
              Get started
            </button>
          </div>
        )}

        {step === "launching" && (
          <p className="text-zinc-400 text-sm">Generating your External ID…</p>
        )}

        {step === "pasting" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-2">
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Your External ID</p>
              <code className="text-sm text-emerald-400 break-all">{externalId}</code>
            </div>

            <a
              href={cfUrl(externalId)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-zinc-600 hover:border-zinc-400 transition-colors text-sm font-medium"
            >
              Open CloudFormation in AWS Console ↗
            </a>

            <div className="space-y-2">
              <label className="text-xs text-zinc-500 uppercase tracking-wider">
                Paste Role ARN from CloudFormation Outputs
              </label>
              <input
                type="text"
                value={roleArn}
                onChange={(e) => setRoleArn(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/SpottickerReadOnly"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-400"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={!roleArn.startsWith("arn:aws:iam::")}
              className="w-full py-2.5 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Verify connection
            </button>
          </div>
        )}

        {step === "verifying" && (
          <p className="text-zinc-400 text-sm">Verifying role access…</p>
        )}

        {step === "done" && (
          <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 p-4 space-y-3">
            <p className="text-emerald-400 font-medium">Connected successfully</p>
            <p className="text-sm text-zinc-400">
              Connection ID: <code className="text-zinc-300">{connectionId}</code>
            </p>
            <p className="text-xs text-zinc-500">
              Save this connection ID — you'll use it to fetch Spot Placement Scores.
            </p>
            <a href="/" className="text-sm text-zinc-400 hover:text-zinc-200 underline">
              ← Back to matrix
            </a>
          </div>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 p-4 space-y-2">
            <p className="text-red-400 font-medium">Connection failed</p>
            <p className="text-sm text-zinc-400">{errorMsg}</p>
            <button
              onClick={() => setStep("init")}
              className="text-sm text-zinc-400 hover:text-zinc-200 underline"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
