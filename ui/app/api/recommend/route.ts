import { buildRecommendationResponse } from "@/lib/recommend";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt = String(body.prompt ?? "").trim();
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const recommendation = await buildRecommendationResponse(prompt);
    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("/api/recommend error", error);
    return NextResponse.json(
      { error: "Failed to build recommendation." },
      { status: 500 }
    );
  }
}
