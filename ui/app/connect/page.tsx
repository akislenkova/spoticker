"use client";

import ConnectEmailStep from "@/components/ConnectEmailStep";
import CopyField from "@/components/CopyField";
import { createClient } from "@/lib/supabase/browser";
import { useEffect, useState, type ReactNode } from "react";

const SPOTTICKER_ACCOUNT = process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID ?? "601883338057";
/** IAM role must exist in that account or CF returns "Invalid principal". Root always works with ExternalId. */
const SPOTTICKER_ROOT_ARN = `arn:aws:iam::${SPOTTICKER_ACCOUNT}:root`;
const SPOTTICKER_ROLE_ARN =
  process.env.NEXT_PUBLIC_SPOTTICKER_ASSUME_ROLE_ARN ?? SPOTTICKER_ROOT_ARN;
const TEMPLATE_URL = process.env.NEXT_PUBLIC_CF_TEMPLATE_URL ?? "";
const AWS_REGION = process.env.NEXT_PUBLIC_AWS_REGION ?? "us-east-1";

const templateUrlReady =
  TEMPLATE_URL.startsWith("https://") && !TEMPLATE_URL.includes("YOUR_BUCKET");

/** Standard “Create stack” wizard (upload template) — avoids broken Quick create URLs */
const CF_CREATE_STACK_URL = `https://${AWS_REGION}.console.aws.amazon.com/cloudformation/home?region=${AWS_REGION}#/stacks/create/template`;

const TEMPLATE_DOWNLOAD = "/api/aws/cfn-template";
type Step = "init" | "launching" | "pasting" | "verifying" | "error";

function cfQuickCreateUrl(externalId: string) {
  const params = new URLSearchParams({
    templateURL: TEMPLATE_URL,
    stackName: "SpottickerReadOnly",
    param_SpottickerRoleArn: SPOTTICKER_ROLE_ARN,
    param_ExternalId: externalId,
  });
  return `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review?${params}`;
}

function AwsGuideStep({
  n,
  title,
  children,
  done,
}: {
  n: number;
  title: string;
  children: ReactNode;
  done?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <span
        className={`shrink-0 w-6 h-6 rounded border flex items-center justify-center font-mono text-xs font-medium ${
          done
            ? "border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] text-[#00ff88]"
            : "border-[rgba(0,255,136,0.1)] bg-[rgba(0,4,3,0.5)] text-[#3a5a48]"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="space-y-2 pb-4 min-w-0 flex-1">
        <p className="font-mono text-sm font-medium text-[#c8f0dc] tracking-wide">{title}</p>
        <div className="font-mono text-sm text-[#3a5a48] space-y-2">{children}</div>
      </div>
    </li>
  );
}

export default function ConnectPage() {
  const [step, setStep] = useState<Step>("init");
  const [connectionId, setConnectionId] = useState("");
  const [externalId, setExternalId] = useState("");
  const [roleArn, setRoleArn] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [errorHint, setErrorHint] = useState("");
  const [awsStarted, setAwsStarted] = useState(false);
  const [serverConfigured, setServerConfigured] = useState<boolean | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setSignedIn(!!user));
  }, []);

  useEffect(() => {
    fetch("/api/aws/config", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          setServerConfigured(false);
          return;
        }
        const d = await r.json();
        setServerConfigured(d.serverConfigured === true);
      })
      .catch(() => setServerConfigured(false));
  }, []);

  function handleUnauthorized(resp: Response) {
    if (resp.status === 401) {
      setSignedIn(false);
      setStep("init");
      return true;
    }
    return false;
  }

  async function handleStart() {
    setStep("launching");
    setErrorHint("");
    const resp = await fetch("/api/aws/connect", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init" }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (handleUnauthorized(resp)) return;
      setErrorMsg(data.error ?? "Could not start connection");
      setErrorHint(data.hint ?? "");
      setStep("error");
      return;
    }
    setConnectionId(data.id);
    setExternalId(data.external_id);
    setStep("pasting");
  }

  async function handleVerify() {
    setStep("verifying");
    setErrorHint("");
    const resp = await fetch("/api/aws/connect", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", id: connectionId, role_arn: roleArn }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      if (handleUnauthorized(resp)) return;
      setErrorMsg(data.error ?? "Verification failed");
      setErrorHint(data.hint ?? "");
      setStep("error");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div className="animate-fade-in-up space-y-1">
          <p className="font-mono text-[10px] tracking-[0.25em] text-[rgba(0,255,136,0.4)] uppercase">
            // AWS Integration
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#c8f0dc] cursor-blink">Connect AWS</h1>
          <p className="font-mono text-[#3a5a48] text-sm mt-1">
            Deploy a read-only IAM role via CloudFormation — your AWS keys never leave AWS.
          </p>
        </div>

        {signedIn === null && (
          <p className="font-mono text-sm text-[#2d4038] animate-pulse">Loading…</p>
        )}

        {signedIn === false && <ConnectEmailStep />}

        {signedIn === true && step === "init" && (
          <div className="space-y-4">
            <p className="font-mono text-sm text-[#4a6a58]">
              We generate a unique External ID, walk you through AWS CloudFormation, then verify
              access. About 2–3 minutes.
            </p>
            {serverConfigured === false && (
              <div className="font-mono text-sm rounded border border-[rgba(255,149,0,0.25)] bg-[rgba(255,149,0,0.06)] p-3 space-y-2">
                <p className="font-medium text-[#ff9500]">Server AWS keys missing</p>
                <p className="text-[#4a6a58]">
                  Add <code className="text-[#c8f0dc]">SPOTTICKER_AWS_ACCESS_KEY_ID</code> and{" "}
                  <code className="text-[#c8f0dc]">SPOTTICKER_AWS_SECRET_ACCESS_KEY</code> to{" "}
                  <code className="text-[#c8f0dc]">ui/.env.local</code>, then restart{" "}
                  <code className="text-[#c8f0dc]">npm run dev</code>.
                </p>
                <p className="text-xs text-[#2d4038]">
                  See <code>aws/iam/README.md</code> in the repo for IAM setup.
                </p>
              </div>
            )}
            <button
              onClick={handleStart}
              disabled={serverConfigured === false}
              className="w-full py-2.5 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] font-mono font-medium text-[#00ff88] hover:bg-[rgba(0,255,136,0.14)] hover:border-[rgba(0,255,136,0.5)] hover:shadow-[0_0_16px_rgba(0,255,136,0.12)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              &gt; Generate External ID &amp; continue
            </button>
          </div>
        )}

        {signedIn === true && step === "launching" && (
          <p className="font-mono text-sm text-[#3a5a48] animate-pulse">&gt;_ Generating your External ID…</p>
        )}

        {signedIn === true && step === "pasting" && (
          <div className="space-y-5">
            <ol className="list-none space-y-0">
              <AwsGuideStep n={1} title="Open AWS & upload the template" done={awsStarted}>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a
                    href={CF_CREATE_STACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setAwsStarted(true)}
                    className="flex-1 text-center py-2.5 rounded-lg bg-[#ff9900] text-black text-sm font-semibold hover:bg-[#ec8800] transition-colors"
                  >
                    Open CloudFormation ↗
                  </a>
                  <a
                    href={TEMPLATE_DOWNLOAD}
                    download="spotticker-role.yaml"
                    className="flex-1 text-center py-2.5 rounded border border-[rgba(0,255,136,0.15)] font-mono text-sm font-medium text-[#4a6a58] hover:border-[rgba(0,255,136,0.3)] hover:text-[#7aab8e] transition-all"
                  >
                    Download template
                  </a>
                </div>
                <div className="rounded border border-[rgba(0,255,136,0.08)] bg-[rgba(0,4,3,0.7)] p-3 space-y-2 font-mono text-xs text-[#3a5a48]">
                  <p className="text-[#7aab8e] font-medium tracking-wide">// upload tips</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      Use <strong className="text-[#7aab8e]">Download template</strong>, then in AWS{" "}
                      <strong className="text-[#7aab8e]">Choose file</strong> → pick{" "}
                      <code className="text-[#00ff88]">spotticker-role.yaml</code> from Downloads.
                    </li>
                    <li>
                      If the name ends in <code className="text-[#4a6a58]">.yaml.txt</code>, rename to{" "}
                      <code className="text-[#4a6a58]">.yaml</code>.
                    </li>
                    <li>
                      Developers: in your clone, the file is{" "}
                      <code className="text-[#4a6a58]">aws/cloudformation/spotticker-role.yaml</code>.
                    </li>
                    <li>
                      Wait until the filename appears, then click <strong className="text-[#7aab8e]">Next</strong>.
                    </li>
                  </ul>
                </div>
                {templateUrlReady && (
                  <p className="font-mono text-[10px] text-[#1e3028]">
                    Or use{" "}
                    <a
                      href={cfQuickCreateUrl(externalId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[rgba(0,255,136,0.45)] hover:text-[rgba(0,255,136,0.8)] underline transition-colors"
                    >
                      one-click deploy
                    </a>{" "}
                    (hosted template).
                  </p>
                )}
              </AwsGuideStep>

              <AwsGuideStep n={2} title="Paste these parameters in AWS">
                <CopyField
                  label="ExternalId"
                  value={externalId}
                  hint="Paste into the ExternalId field in CloudFormation. Already saved in Spoticker."
                />
                <CopyField
                  label="SpottickerRoleArn — paste this in AWS"
                  value={SPOTTICKER_ROLE_ARN}
                  hint="Must be an ARN that exists in Spoticker’s AWS account (601883338057). Use root unless SpottickerAssumeRole is created."
                />
                <p className="font-mono text-[10px] text-[#1e3028]">
                  Your error means <code className="text-[#3a5a48]">role/SpottickerAssumeRole</code> does not exist yet.
                  Use the root ARN above. Delete the failed stack, then create a new one.
                </p>
              </AwsGuideStep>

              <AwsGuideStep n={3} title="Deploy, then paste RoleArn here">
                <p>
                  Wait until stack status is <strong className="text-[#7aab8e]">CREATE_COMPLETE</strong>.
                  Open the <strong className="text-[#7aab8e]">Outputs</strong> tab and copy{" "}
                  <strong className="text-[#7aab8e]">RoleArn</strong>.
                </p>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] text-[#2d4038] uppercase tracking-[0.2em]">
                    RoleArn from CloudFormation Outputs
                  </label>
                  <input
                    type="text"
                    value={roleArn}
                    onChange={(e) => setRoleArn(e.target.value)}
                    placeholder="arn:aws:iam::123456789012:role/SpottickerReadOnly"
                    className="w-full bg-[rgba(0,4,3,0.8)] border border-[rgba(0,255,136,0.12)] rounded px-3 py-2 font-mono text-sm text-[#c8f0dc] placeholder:text-[#1e3028] focus:outline-none focus:border-[rgba(0,255,136,0.35)] focus:shadow-[0_0_12px_rgba(0,255,136,0.08)] transition-all"
                  />
                </div>
              </AwsGuideStep>
            </ol>

            <button
              onClick={handleVerify}
              disabled={!roleArn.startsWith("arn:aws:iam::")}
              className="w-full py-2.5 rounded border border-[rgba(0,255,136,0.3)] bg-[rgba(0,255,136,0.08)] font-mono font-medium text-[#00ff88] hover:bg-[rgba(0,255,136,0.14)] hover:border-[rgba(0,255,136,0.5)] hover:shadow-[0_0_16px_rgba(0,255,136,0.12)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              &gt; Verify connection
            </button>
          </div>
        )}

        {signedIn === true && step === "verifying" && (
          <p className="font-mono text-sm text-[#3a5a48] animate-pulse">
            &gt;_ Verifying role in your AWS account…
          </p>
        )}

        {signedIn === true && step === "error" && (
          <div className="relative rounded border border-[rgba(255,50,80,0.2)] bg-[rgba(255,50,80,0.04)] p-4 space-y-3">
            <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(255,50,80,0.35)] pointer-events-none" />
            <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(255,50,80,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(255,50,80,0.35)] pointer-events-none" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(255,50,80,0.35)] pointer-events-none" />
            <p className="font-mono font-medium text-[#ff4060]">// Connection failed</p>
            <p className="font-mono text-sm text-[#4a6a58]">{errorMsg}</p>
            {errorHint ? (
              <p className="font-mono text-sm text-[rgba(255,149,0,0.8)]">{errorHint}</p>
            ) : null}
            <p className="font-mono text-xs text-[#2d4038]">
              Common fixes: ExternalId in AWS must match exactly · stack must be CREATE_COMPLETE ·
              RoleArn must be from Outputs (not typed manually wrong).
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setErrorMsg("");
                  setErrorHint("");
                  if (connectionId && externalId) setStep("pasting");
                  else setStep("init");
                }}
                className="font-mono text-sm text-[#3a5a48] hover:text-[rgba(0,255,136,0.7)] underline transition-colors"
              >
                Try again
              </button>
              <button
                onClick={() => setStep("init")}
                className="font-mono text-sm text-[#3a5a48] hover:text-[rgba(0,255,136,0.7)] underline transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
