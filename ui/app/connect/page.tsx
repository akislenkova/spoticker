"use client";

import CopyField from "@/components/CopyField";
import { useState, type ReactNode } from "react";

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
        className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
          done ? "bg-emerald-900 text-emerald-400" : "bg-zinc-800 text-zinc-400"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="space-y-2 pb-4 min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <div className="text-sm text-zinc-500 space-y-2">{children}</div>
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
  const [awsStarted, setAwsStarted] = useState(false);

  async function handleStart() {
    setStep("launching");
    const resp = await fetch("/api/aws/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init" }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      setErrorMsg(data.error ?? "Could not start connection");
      setStep("error");
      return;
    }
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
    if (!resp.ok) {
      setErrorMsg(data.error ?? "Verification failed");
      setStep("error");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connect AWS Account</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Deploy a read-only IAM role via CloudFormation — your AWS keys never leave AWS.
          </p>
        </div>

        {step === "init" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-400">
              We generate a unique External ID, walk you through AWS CloudFormation, then verify
              access. About 2–3 minutes.
            </p>
            {!SPOTTICKER_ROLE_ARN && (
              <p className="text-sm text-amber-500 rounded-lg border border-amber-800/40 bg-amber-950/20 p-3">
                Admin: set <code className="text-amber-200">NEXT_PUBLIC_SPOTTICKER_ASSUME_ROLE_ARN</code>{" "}
                in <code className="text-amber-200">ui/.env.local</code> and restart dev.
              </p>
            )}
            <button
              onClick={handleStart}
              className="w-full py-2.5 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition-colors"
            >
              Generate External ID & continue
            </button>
          </div>
        )}

        {step === "launching" && (
          <p className="text-zinc-400 text-sm animate-pulse">Generating your External ID…</p>
        )}

        {step === "pasting" && (
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
                    className="flex-1 text-center py-2.5 rounded-lg border border-zinc-600 text-sm font-medium hover:border-zinc-400 transition-colors"
                  >
                    Download template
                  </a>
                </div>
                <div className="rounded-md border border-zinc-700 bg-zinc-900/80 p-3 space-y-2 text-xs text-zinc-400">
                  <p className="text-zinc-300 font-medium">Upload tips (same for every user)</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      Use <strong className="text-zinc-300">Download template</strong>, then in AWS{" "}
                      <strong className="text-zinc-300">Choose file</strong> → pick{" "}
                      <code className="text-emerald-400">spotticker-role.yaml</code> from Downloads.
                    </li>
                    <li>
                      If the name ends in <code className="text-zinc-400">.yaml.txt</code>, rename to{" "}
                      <code className="text-zinc-400">.yaml</code>.
                    </li>
                    <li>
                      Developers: in your clone, the file is{" "}
                      <code className="text-zinc-400">aws/cloudformation/spotticker-role.yaml</code>.
                    </li>
                    <li>
                      Wait until the filename appears, then click <strong className="text-zinc-300">Next</strong>.
                    </li>
                  </ul>
                </div>
                {templateUrlReady && (
                  <p className="text-xs text-zinc-600">
                    Or use{" "}
                    <a
                      href={cfQuickCreateUrl(externalId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-zinc-400"
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
                <p className="text-xs text-zinc-600">
                  Your error means <code className="text-zinc-400">role/SpottickerAssumeRole</code> does not exist yet.
                  Use the root ARN above. Delete the failed stack, then create a new one.
                </p>
              </AwsGuideStep>

              <AwsGuideStep n={3} title="Deploy, then paste RoleArn here">
                <p>
                  Wait until stack status is <strong className="text-zinc-300">CREATE_COMPLETE</strong>.
                  Open the <strong className="text-zinc-300">Outputs</strong> tab and copy{" "}
                  <strong className="text-zinc-300">RoleArn</strong>.
                </p>
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500 uppercase tracking-wider">
                    RoleArn from CloudFormation Outputs
                  </label>
                  <input
                    type="text"
                    value={roleArn}
                    onChange={(e) => setRoleArn(e.target.value)}
                    placeholder="arn:aws:iam::123456789012:role/SpottickerReadOnly"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-zinc-400"
                  />
                </div>
              </AwsGuideStep>
            </ol>

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
          <p className="text-zinc-400 text-sm animate-pulse">Verifying role in your AWS account…</p>
        )}

        {step === "error" && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 p-4 space-y-3">
            <p className="text-red-400 font-medium">Connection failed</p>
            <p className="text-sm text-zinc-400">{errorMsg}</p>
            <p className="text-xs text-zinc-500">
              Common fixes: ExternalId in AWS must match exactly · stack must be CREATE_COMPLETE ·
              RoleArn must be from Outputs (not typed manually wrong).
            </p>
            <button
              onClick={() => setStep("init")}
              className="text-sm text-zinc-400 hover:text-zinc-200 underline"
            >
              Start over
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
