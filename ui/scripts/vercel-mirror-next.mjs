/**
 * Fallback when Vercel Root Directory is the repo root (not `ui/`).
 * Post-build validation expects `.next` at the repo root; `next build` writes `ui/.next`.
 *
 * Preferred fix: Vercel → Settings → Root Directory → `ui`
 */
import { basename, dirname, join } from "path";
import { cpSync, existsSync, rmSync } from "fs";
import { fileURLToPath } from "url";

if (process.env.VERCEL !== "1") {
  process.exit(0);
}

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
if (basename(uiRoot) !== "ui") {
  process.exit(0);
}

const repoRoot = dirname(uiRoot);
const src = join(uiRoot, ".next");
const dest = join(repoRoot, ".next");

if (!existsSync(src)) {
  console.error("vercel-mirror-next: ui/.next missing after build");
  process.exit(1);
}

if (existsSync(dest) && existsSync(join(dest, "routes-manifest.json"))) {
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log("vercel-mirror-next: copied ui/.next to repo root for Vercel validation");
