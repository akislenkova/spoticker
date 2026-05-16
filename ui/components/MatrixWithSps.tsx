"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import PriceMatrix from "./PriceMatrix";
import { MatrixData } from "@/lib/matrix";

export default function MatrixWithSps({ data }: { data: MatrixData }) {
  const params = useSearchParams();
  const cid = params.get("cid");
  const [spsScores, setSpsScores] = useState<Record<string, number>>({});
  const [spsLoading, setSpsLoading] = useState(false);

  useEffect(() => {
    if (!cid) return;
    setSpsLoading(true);
    fetch("/api/aws/sps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connection_id: cid }),
    })
      .then((r) => r.json())
      .then((d) => setSpsScores(d.scores ?? {}))
      .catch(console.error)
      .finally(() => setSpsLoading(false));
  }, [cid]);

  return (
    <div className="space-y-3">
      {cid && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {spsLoading ? (
            <span>Loading Spot Placement Scores…</span>
          ) : Object.keys(spsScores).length > 0 ? (
            <span className="text-emerald-500">
              ● SPS scores loaded ({Object.keys(spsScores).length} regions)
            </span>
          ) : (
            <span className="text-red-400">SPS fetch failed or no data</span>
          )}
        </div>
      )}
      {!cid && (
        <div className="text-xs text-zinc-600">
          <a href="/connect" className="underline hover:text-zinc-400">
            Connect your AWS account
          </a>{" "}
          to see Spot Placement Scores
        </div>
      )}
      <PriceMatrix data={data} spsScores={spsScores} />
    </div>
  );
}
