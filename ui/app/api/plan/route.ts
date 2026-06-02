import { NextRequest, NextResponse } from "next/server";

const PLAN_SERVICE_URL = process.env.PLAN_SERVICE_URL ?? "http://localhost:8001";
const PLAN_SERVICE_SECRET = process.env.PLAN_SERVICE_SECRET;

export async function POST(req: NextRequest) {
  const form = await req.formData();

  const headers: Record<string, string> = {};
  if (PLAN_SERVICE_SECRET) {
    headers["Authorization"] = `Bearer ${PLAN_SERVICE_SECRET}`;
  }

  try {
    const upstream = await fetch(`${PLAN_SERVICE_URL}/analyze`, {
      method: "POST",
      headers,
      body: form,
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Plan service error." },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("/api/plan error", err);
    return NextResponse.json(
      { error: "Plan service unavailable. Make sure `uvicorn app.main:app --port 8001` is running." },
      { status: 503 }
    );
  }
}
