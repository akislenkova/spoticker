"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MatrixLegend from "./MatrixLegend";
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
      await fetch("/api/aws/disconnect", { method: "POST", credentials: "include" });
      setSpsScores({});
      setAwsStatus({ loading: false, connected: false });
    } finally {
      setDisconnecting(false);
    }
  }

  useEffect(() => {
    fetch("/api/aws/status", { credentials: "include" })
      .then((r) => {
        if (r.status === 401) return { connected: false, serverConfigured: true };
        return r.json();
      })
      .then((d) => {
        if (d.connected) {
          setAwsStatus({ loading: false, connected: true, accountId: d.accountId });
        } else {
          setAwsStatus({ loading: false, connected: false });
          if (d.serverConfigured === false) {
            setSpsError("Server AWS keys not configured — add SPOTTICKER_AWS_* to ui/.env.local");
          } else if (d.lastError) {
            setSpsError(d.lastError);
          }
        }
      })
      .catch(() => setAwsStatus({ loading: false, connected: false }));
  }, []);

  useEffect(() => {
    if (!awsStatus.loading && !awsStatus.connected) return;

    if (awsStatus.loading || !awsStatus.connected) return;

    setSpsLoading(true);
    setSpsError(null);
    fetch("/api/aws/sps", { method: "POST", credentials: "include" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setSpsScores({});
          const hint = d.hint ? ` ${d.hint}` : "";
          setSpsError(`${d.error ?? "SPS fetch failed"}${hint}`);
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

  const awsUsesSps = Object.keys(spsScores).length > 0;
  const awsMetric: "sps" | "eviction" | "loading" = awsStatus.loading
    ? "loading"
    : awsUsesSps
      ? "sps"
      : "eviction";

  return (
    <div className="space-y-3">
      <MatrixLegend awsMetric={awsMetric} />

      {!awsStatus.loading && awsStatus.connected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          {spsLoading ? (
            <span>Loading Spot Placement Scores…</span>
          ) : awsUsesSps ? (
            <span className="text-sky-400/90">
              AWS connected · SPS for {Object.keys(spsScores).length} region×instance pairs
              {awsStatus.accountId ? ` · ${awsStatus.accountId}` : ""}
            </span>
          ) : (
            <span className="text-red-400" title={spsError ?? undefined}>
              {spsError ?? "SPS fetch failed — showing advisor eviction rates instead"}
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
        <div className="text-xs text-zinc-600 space-y-1">
          <p>
            <Link href="/connect" className="underline hover:text-zinc-400">
              Connect AWS
            </Link>{" "}
            for Spot Placement Scores (otherwise AWS cells use advisor eviction %).
          </p>
          {spsError ? <p className="text-amber-600/90">{spsError}</p> : null}
        </div>
      )}
      <PriceMatrix data={data} spsScores={spsScores} awsUsesSps={awsUsesSps} />
    </div>
  );
}
