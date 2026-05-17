import { NextResponse } from "next/server";
import { isSpottickerAwsConfigured } from "@/lib/aws-credentials";

const SPOTTICKER_ACCOUNT = process.env.NEXT_PUBLIC_AWS_ACCOUNT_ID ?? "601883338057";

/** GET /api/aws/config — public server/cf hints (no secrets) */
export async function GET() {
  const principal =
    process.env.NEXT_PUBLIC_SPOTTICKER_ASSUME_ROLE_ARN ??
    `arn:aws:iam::${SPOTTICKER_ACCOUNT}:root`;

  return NextResponse.json({
    serverConfigured: isSpottickerAwsConfigured(),
    spottickerAccountId: SPOTTICKER_ACCOUNT,
    spottickerPrincipalArn: principal,
  });
}
