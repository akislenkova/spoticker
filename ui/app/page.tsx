import DataFreshnessBar from "@/components/DataFreshness";
import MatrixWithSps from "@/components/MatrixWithSps";
import RecommendationPanel from "@/components/RecommendationPanel";
import { buildMatrix } from "@/lib/matrix";
import { createClient } from "@/lib/supabase/server";
import { Suspense } from "react";

/** Matrix data can be cached; auth must be per-request (see dynamic). */
export const revalidate = 1800;
export const dynamic = "force-dynamic";

export default async function Home() {
  const matrix = await buildMatrix();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">

        {/* Hero */}
        <div className="animate-fade-in-up space-y-2">
          <p className="font-mono text-[10px] tracking-[0.25em] text-[rgba(0,255,136,0.45)] uppercase">
            // GPU Spot Market Intelligence
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[#c8f0dc] cursor-blink">
            GPU Spot Availability
          </h1>
          <p className="text-[#4a6a58] text-sm mt-1 max-w-2xl font-mono leading-relaxed">
            &gt;_ Compare spot prices and eviction risk across AWS and Azure — or query the GBrain
            agents for a workload-specific pick.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <span className="status-dot" />
            <span className="font-mono text-[10px] text-[rgba(0,255,136,0.4)] tracking-[0.2em] uppercase">
              System Online · Monitoring AWS · Azure
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
            <p className="mt-2 text-sm text-[#3d5a47]">
              Run the AWS and Azure scrapers to populate the matrix.
            </p>
            <code className="mt-4 block text-xs text-[#2d4038] font-mono">
              cd aws &amp;&amp; python scraper.py<br />
              cd azure &amp;&amp; python scraper.py
            </code>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="text-[#3a5a48] text-sm font-mono">
                &gt;_ Loading matrix…
              </div>
            }
          >
            <MatrixWithSps data={matrix} sessionEmail={user?.email ?? null} />
          </Suspense>
        )}
      </div>
    </main>
  );
}
