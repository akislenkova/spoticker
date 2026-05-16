import DataFreshnessBar from "@/components/DataFreshness";
import MatrixWithSps from "@/components/MatrixWithSps";
import RecommendationPanel from "@/components/RecommendationPanel";
import { buildMatrix } from "@/lib/matrix";
import { Suspense } from "react";

export const revalidate = 1800; // refresh every 30 min

export default async function Home() {
  const matrix = await buildMatrix();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">GPU Spot Availability</h1>
          <p className="text-zinc-500 text-sm mt-1">
            Cheapest spot price per GPU type per region. Cell color = eviction risk.
          </p>
        </div>

        <RecommendationPanel />

        <DataFreshnessBar freshness={matrix.freshness} />

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            Low risk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            Medium
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            High
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" />
            No data
          </span>
          <span className="text-zinc-600 w-full sm:w-auto">
            Azure = eviction % · AWS (connected) = Spot Placement Score
          </span>
        </div>

        {matrix.columns.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 px-8 py-16 text-center text-zinc-500">
            <p className="text-lg font-medium text-zinc-400">No data yet</p>
            <p className="mt-2 text-sm">Run the AWS and Azure scrapers to populate the matrix.</p>
            <code className="mt-4 block text-xs text-zinc-600">
              cd aws &amp;&amp; python scraper.py<br />
              cd azure &amp;&amp; python scraper.py
            </code>
          </div>
        ) : (
          <Suspense fallback={<div className="text-zinc-600 text-sm">Loading…</div>}>
            <MatrixWithSps data={matrix} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
