"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PriceMatrix from "./PriceMatrix";
import { MatrixData } from "@/lib/matrix";

type AwsStatus =
  | { loading: true }
  | { loading: false; connected: false }
  | { loading: false; connected: true; accountId?: string | null };

export default function MatrixWithSps({ data }: { data: MatrixData }) {
  const [awsStatus, setAwsStatus] = useState<AwsStatus>({ loading: true });
  const [spsScores, setSpsScores] = useState<Record<string, number>>({});
  const [spsLoading, setSpsLoading] = useState(false);
  const [spsError, setSpsError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await fetch("/api/aws/disconnect", { method: "POST" });
      setSpsScores({});
      setAwsStatus({ loading: false, connected: false });
    } finally {
      setDisconnecting(false);
    }
  }

  useEffect(() => {
    fetch("/api/aws/status")
      .then((r) => {
        if (r.status === 401) return { connected: false };
        return r.json();
      })
      .then((d) => {
        if (d.connected) {
          setAwsStatus({ loading: false, connected: true, accountId: d.accountId });
        } else {
          setAwsStatus({ loading: false, connected: false });
        }
      })
      .catch(() => setAwsStatus({ loading: false, connected: false }));
  }, []);

  useEffect(() => {
    if (!awsStatus.loading && !awsStatus.connected) return;

    if (awsStatus.loading || !awsStatus.connected) return;

    setSpsLoading(true);
    setSpsError(null);
    fetch("/api/aws/sps", { method: "POST" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setSpsScores({});
          setSpsError(d.error ?? "SPS fetch failed");
          return;
        }
        const scores = d.scores ?? {};
        if (Object.keys(scores).length === 0) {
          setSpsError("No placement scores returned for GPU regions");
        }
        setSpsScores(scores);
      })
      .catch(() => setSpsError("SPS fetch failed"))
      .finally(() => setSpsLoading(false));
  }, [awsStatus]);

  return (
    <div className="space-y-3">
      {!awsStatus.loading && awsStatus.connected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {spsLoading ? (
            <span>Loading Spot Placement Scores…</span>
          ) : Object.keys(spsScores).length > 0 ? (
            <span className="text-emerald-500">
              ● SPS loaded ({Object.keys(spsScores).length} regions)
              {awsStatus.accountId ? ` · account ${awsStatus.accountId}` : ""}
            </span>
          ) : (
            <span className="text-red-400" title={spsError ?? undefined}>
              {spsError ?? "SPS fetch failed or no data"}
            </span>
          )}
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-zinc-500 hover:text-zinc-300 underline disabled:opacity-40"
          >
            {disconnecting ? "Disconnecting…" : "Disconnect AWS"}
          </button>
        </div>
      )}
      {!awsStatus.loading && !awsStatus.connected && (
        <div className="text-xs text-zinc-600">
          <Link href="/connect" className="underline hover:text-zinc-400">
            Connect your AWS account
          </Link>{" "}
          to see Spot Placement Scores
        </div>
      )}
      {Object.keys(spsScores).length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
          <span className="text-zinc-500 w-full sm:w-auto">AWS cells — Spot Placement Score:</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            High (8–10)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Medium (5–7)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            Low (1–4)
          </span>
          <span className="text-zinc-600">Azure = eviction % (unchanged)</span>
        </div>
      )}
      <PriceMatrix data={data} spsScores={spsScores} />
    </div>
  );
}
