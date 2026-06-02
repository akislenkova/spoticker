import DataFreshnessBar from "@/components/DataFreshness";
import MatrixWithSps from "@/components/MatrixWithSps";
import RecommendationPanel from "@/components/RecommendationPanel";
import { buildMatrix } from "@/lib/matrix";
import { Suspense } from "react";

export const revalidate = 1800;

export default async function Home() {
  const matrix = await buildMatrix();

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Hero */}
        <div className="animate-fade-in-up space-y-2">
          <p className="font-mono text-[10px] tracking-[0.25em] text-[#42c880] uppercase">
            // Spot Market Intelligence
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[#c8f0dc] cursor-blink">
            Spot Availability
          </h1>
          <p className="text-[#8ec4a6] text-sm mt-1 max-w-2xl font-mono leading-relaxed">
            &gt;_ Compare spot prices and eviction risk across AWS, Azure, GCP, RunPod, Vast.ai,
            CoreWeave, and Nebius — or ask the agentic layer for a workload-specific pick.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <span className="status-dot" />
            <span className="font-mono text-[10px] text-[#42c880] tracking-[0.2em] uppercase">
              System Online · Monitoring AWS · Azure · GCP · RunPod · Vast.ai · CoreWeave · Nebius
            </span>
          </div>
        </div>

        <RecommendationPanel />

        <DataFreshnessBar freshness={matrix.freshness} />

        {matrix.columns.length === 0 ? (
          <div className="relative rounded-lg border border-[rgba(0,255,136,0.1)] bg-[rgba(4,14,10,0.9)] px-8 py-16 text-center backdrop-blur-sm">
            <span className="absolute top-0 left-0 w-3 h-3 border-t border-l border-[rgba(0,255,136,0.3)] pointer-events-none" />
            <span className="absolute top-0 right-0 w-3 h-3 border-t border-r border-[rgba(0,255,136,0.3)] pointer-events-none" />
            <span className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-[rgba(0,255,136,0.3)] pointer-events-none" />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[rgba(0,255,136,0.3)] pointer-events-none" />
            <p className="text-base font-medium text-[#7aab8e]">No data yet</p>
            <p className="mt-2 text-sm text-[#80b898]">
              Run the scrapers to populate the matrix.
            </p>
            <code className="mt-4 block text-xs text-[#80b898] font-mono">
              cd aws &amp;&amp; python scraper.py<br />
              cd azure &amp;&amp; python scraper.py<br />
              cd gcp &amp;&amp; python scraper.py<br />
              cd runpod &amp;&amp; python scraper.py<br />
              cd vast &amp;&amp; python scraper.py<br />
              cd coreweave &amp;&amp; python scraper.py<br />
              cd nebius &amp;&amp; python scraper.py
            </code>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="text-[#80b898] text-sm font-mono">
                &gt;_ Loading matrix…
              </div>
            }
          >
            <MatrixWithSps data={matrix} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
