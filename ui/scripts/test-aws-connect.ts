/**
 * Quick check that SPOTTICKER_AWS_* can call STS.
 * Usage: cd ui && npx tsx scripts/test-aws-connect.ts
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

const envPath = join(dirname(fileURLToPath(import.meta.url)), "../.env.local");
try {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env.local optional if vars already exported
}
import { getSpottickerCredentials, isSpottickerAwsConfigured } from "../lib/aws-credentials";

async function main() {
  if (!isSpottickerAwsConfigured()) {
    console.error("Missing SPOTTICKER_AWS_ACCESS_KEY_ID / SPOTTICKER_AWS_SECRET_ACCESS_KEY in ui/.env.local");
    process.exit(1);
  }

  const sts = new STSClient({ region: "us-east-1", credentials: getSpottickerCredentials() });
  const id = await sts.send(new GetCallerIdentityCommand({}));
  console.log("OK — Spoticker AWS identity:", id.Arn);
  console.log("Account:", id.Account);
}

main().catch((e) => {
  console.error("Failed:", e.message ?? e);
  process.exit(1);
});
