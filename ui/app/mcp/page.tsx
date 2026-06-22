import CodeBlock from "@/components/CodeBlock";

export const metadata = {
  title: "Spoticker | MCP Integration",
  description:
    "Integrate Spoticker GPU spot price intelligence into any MCP-compatible agent harness.",
};

const INSTALL = `git clone https://github.com/akislenkova/spoticker.git
cd spoticker/mcp
pip install -e .`;

const ENV_VARS = `ANTHROPIC_API_KEY=sk-ant-...          # required for analyze_workload
SUPABASE_URL=https://xxxx.supabase.co  # required for all tools
SUPABASE_SERVICE_KEY=eyJ...            # required for all tools`;

const CLAUDE_CODE_CONFIG = `// ~/.claude/settings.json  (or project-level .claude/settings.json)
{
  "mcpServers": {
    "spoticker": {
      "command": "spoticker-mcp",
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "SUPABASE_URL": "https://xxxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJ...service_role..."
      }
    }
  }
}`;

const CLAUDE_DESKTOP_CONFIG = `// ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "spoticker": {
      "command": "spoticker-mcp",
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "SUPABASE_URL": "https://xxxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJ...service_role..."
      }
    }
  }
}`;

const CURSOR_CONFIG = `// .cursor/mcp.json  (project root)
{
  "mcpServers": {
    "spoticker": {
      "command": "spoticker-mcp",
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "SUPABASE_URL": "https://xxxx.supabase.co",
        "SUPABASE_SERVICE_KEY": "eyJ...service_role..."
      }
    }
  }
}`;

const GET_PRICES_EXAMPLE = `// find cheapest H100 spots across all clouds
get_spot_prices(gpu_type="H100", limit=10)

// 4× A100 options on AWS only
get_spot_prices(gpu_type="A100-80GB", cloud="aws", min_gpus=4)

// everything available right now (up to 20 results)
get_spot_prices()`;

const ANALYZE_EXAMPLE = `// pass a Dockerfile and let the pipeline recommend placement
analyze_workload(
  files=[{"path": "Dockerfile", "content": "<your dockerfile>"}],
  objective="cost_reliability"
)

// with an explicit intent to guide inference
analyze_workload(
  files=[{"path": "train.yaml", "content": "<k8s manifest>"}],
  objective="cost",
  intent="train a 7B LLaMA model for ~8 hours, need at least 2× H100"
)`;

const AGENT_PROMPTS = [
  "What's the cheapest H100 spot available right now across all clouds?",
  "Get me 4× A100-80GB options under $12/hr, preferably with low eviction.",
  "Analyze my Dockerfile and recommend the best spot placement for a training job.",
  "Compare AWS vs Azure spot prices for a single A10G GPU.",
  "I need multi-cloud HA for my inference workload — analyze my k8s YAML.",
];

export default function McpPage() {
  return (
    <main className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto space-y-12">

        {/* Hero */}
        <div className="animate-fade-in-up space-y-2">
          <p className="font-mono text-[10px] tracking-[0.25em] text-[#42c880] uppercase">
            // MCP Integration
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[#c8f0dc]">
            Spoticker MCP Server
          </h1>
          <p className="text-[#8ec4a6] text-sm font-mono leading-relaxed max-w-2xl">
            &gt;_ Two tools for any MCP-compatible agent harness.{" "}
            <span className="text-[#42c880]">get_spot_prices</span> queries live
            GPU spot prices across AWS, Azure, GCP, RunPod, CoreWeave, and Nebius.{" "}
            <span className="text-[#42c880]">analyze_workload</span> runs a
            5-stage pipeline to turn your Dockerfile, k8s manifest, or Terraform
            into a ranked placement recommendation with a deployment-ready diff.
          </p>
        </div>

        {/* Install */}
        <section className="space-y-4">
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#4a6a58] uppercase">
            // 01 — install
          </p>
          <CodeBlock label="shell" code={INSTALL} />
          <p className="font-mono text-[10px] text-[#2d4038]">
            requires Python 3.11+. the{" "}
            <span className="text-[#8ec4a6]">spoticker-mcp</span> command is
            added to your PATH after install.
          </p>

          <div className="mt-2">
            <CodeBlock label=".env (mcp/ directory or shell exports)" code={ENV_VARS} />
          </div>
          <p className="font-mono text-[10px] text-[#2d4038]">
            <span className="text-[#8ec4a6]">ANTHROPIC_API_KEY</span> is only
            needed for <span className="text-[#8ec4a6]">analyze_workload</span>{" "}
            (stages 2 and 4 call Claude for spec inference and diff generation).
            Supabase keys are required for both tools.
          </p>
        </section>

        {/* Configure */}
        <section className="space-y-5">
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#4a6a58] uppercase">
            // 02 — configure your harness
          </p>

          <div className="space-y-3">
            <p className="font-mono text-[10px] text-[#5a8a6a] tracking-wider">
              Claude Code
            </p>
            <CodeBlock label="~/.claude/settings.json" code={CLAUDE_CODE_CONFIG} />
            <p className="font-mono text-[10px] text-[#2d4038]">
              Use{" "}
              <span className="text-[#8ec4a6]">~/.claude/settings.json</span>{" "}
              for global access, or{" "}
              <span className="text-[#8ec4a6]">
                .claude/settings.json
              </span>{" "}
              at your project root to scope it to one repo. Run{" "}
              <span className="text-[#8ec4a6]">/mcp</span> in Claude Code to
              verify the server loaded.
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-[10px] text-[#5a8a6a] tracking-wider">
              Claude Desktop
            </p>
            <CodeBlock label="claude_desktop_config.json" code={CLAUDE_DESKTOP_CONFIG} />
          </div>

          <div className="space-y-3">
            <p className="font-mono text-[10px] text-[#5a8a6a] tracking-wider">
              Cursor / Windsurf
            </p>
            <CodeBlock label=".cursor/mcp.json" code={CURSOR_CONFIG} />
            <p className="font-mono text-[10px] text-[#2d4038]">
              Windsurf uses{" "}
              <span className="text-[#8ec4a6]">~/.codeium/windsurf/mcp_config.json</span>{" "}
              with the same schema.
            </p>
          </div>
        </section>

        {/* Tools */}
        <section className="space-y-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#4a6a58] uppercase">
            // 03 — tool reference
          </p>

          {/* get_spot_prices */}
          <div className="rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(4,14,10,0.7)] p-5 space-y-4">
            <div>
              <p className="font-mono text-sm font-bold text-[#00ff88]">
                get_spot_prices
              </p>
              <p className="font-mono text-xs text-[#6a9a7e] mt-1">
                Query live GPU spot prices from the Spoticker database. All
                parameters are optional — omit to return everything.
              </p>
            </div>

            <div className="space-y-1.5">
              {[
                {
                  name: "gpu_type",
                  type: "string?",
                  desc: '"H100" | "A100-80GB" | "A100-40GB" | "V100" | "A10G" | "L4" | "T4"',
                },
                {
                  name: "cloud",
                  type: "string?",
                  desc: '"aws" | "azure" | "gcp" — omit for all providers',
                },
                {
                  name: "min_gpus",
                  type: "int",
                  desc: "minimum GPU count required (default 1)",
                },
                {
                  name: "limit",
                  type: "int",
                  desc: "max results, sorted cheapest-first (default 20)",
                },
              ].map((p) => (
                <div key={p.name} className="flex gap-3 font-mono text-xs">
                  <span className="text-[#42c880] w-24 shrink-0">{p.name}</span>
                  <span className="text-[#2d5040] w-14 shrink-0">{p.type}</span>
                  <span className="text-[#6a9a7e]">{p.desc}</span>
                </div>
              ))}
            </div>

            <div className="text-[10px] font-mono text-[#2d4038] border-t border-[rgba(0,255,136,0.06)] pt-3">
              Returns list of{" "}
              <span className="text-[#8ec4a6]">
                &#123; cloud, region, sku, gpu_type, gpu_count,
                hourly_price_usd, ondemand_price_usd, eviction_rate,
                eviction_source, eviction_note &#125;
              </span>
            </div>

            <CodeBlock label="example calls" code={GET_PRICES_EXAMPLE} />
          </div>

          {/* analyze_workload */}
          <div className="rounded border border-[rgba(0,255,136,0.1)] bg-[rgba(4,14,10,0.7)] p-5 space-y-4">
            <div>
              <p className="font-mono text-sm font-bold text-[#00ff88]">
                analyze_workload
              </p>
              <p className="font-mono text-xs text-[#6a9a7e] mt-1">
                5-stage pipeline: parse artifact → infer missing specs via Claude
                → rank live spot candidates → rewrite artifact → validate output.
                Returns a unified diff + migration commands ready to apply.
              </p>
            </div>

            <div className="space-y-1.5">
              {[
                {
                  name: "files",
                  type: "list",
                  desc: '[{"path": "<name>", "content": "<text>"}] — Dockerfile, k8s YAML, Terraform .tf, Helm values',
                },
                {
                  name: "objective",
                  type: "string",
                  desc: '"cost" | "cost_reliability" | "ha_multi_cloud" (default: cost_reliability)',
                },
                {
                  name: "intent",
                  type: "string?",
                  desc: 'free-text guidance for ambiguous artifacts, e.g. "train a 7B model for 8h"',
                },
              ].map((p) => (
                <div key={p.name} className="flex gap-3 font-mono text-xs">
                  <span className="text-[#42c880] w-24 shrink-0">{p.name}</span>
                  <span className="text-[#2d5040] w-14 shrink-0">{p.type}</span>
                  <span className="text-[#6a9a7e]">{p.desc}</span>
                </div>
              ))}
            </div>

            <div className="text-[10px] font-mono text-[#2d4038] border-t border-[rgba(0,255,136,0.06)] pt-3 space-y-0.5">
              <p>Returns <span className="text-[#8ec4a6]">PlanResult</span>:</p>
              {[
                ["spec", "extracted workload spec (GPU type, count, framework, env vars)"],
                ["candidates", "top 5 ranked placements with prices and eviction rates"],
                ["chosen", "the top recommendation"],
                ["rewrite", "unified diff + migration_commands to update your artifact"],
                ["validation_passed", "whether the rewritten artifact passed structural checks"],
                ["error", "set if no candidates found or pipeline failed"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3">
                  <span className="text-[#8ec4a6] w-32 shrink-0">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>

            <CodeBlock label="example calls" code={ANALYZE_EXAMPLE} />
          </div>
        </section>

        {/* Example prompts */}
        <section className="space-y-4">
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#4a6a58] uppercase">
            // 04 — example agent prompts
          </p>
          <p className="font-mono text-[10px] text-[#2d4038]">
            Copy any of these into your agent to verify the integration is working.
          </p>
          <div className="space-y-2">
            {AGENT_PROMPTS.map((prompt) => (
              <div
                key={prompt}
                className="flex items-start gap-3 rounded border border-[rgba(0,255,136,0.07)] bg-[rgba(4,14,10,0.5)] px-4 py-2.5"
              >
                <span className="font-mono text-[#2d5040] text-xs shrink-0 mt-0.5">
                  &gt;_
                </span>
                <p className="font-mono text-xs text-[#8ec4a6]">{prompt}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Source */}
        <section className="space-y-2 pb-4">
          <p className="font-mono text-[11px] tracking-[0.2em] text-[#4a6a58] uppercase">
            // source
          </p>
          <p className="font-mono text-xs text-[#2d4038]">
            <a
              href="https://github.com/akislenkova/spoticker"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#42c880] hover:text-[#a0dfc0] transition-colors underline underline-offset-2"
            >
              github.com/akislenkova/spoticker
            </a>{" "}
            — MCP server source is in{" "}
            <span className="text-[#8ec4a6]">mcp/</span>. Issues and PRs welcome.
          </p>
        </section>

      </div>
    </main>
  );
}
