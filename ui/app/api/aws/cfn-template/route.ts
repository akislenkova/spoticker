import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

/** Force-download CloudFormation template with correct MIME type for AWS Console */
export async function GET() {
  const filePath = path.join(process.cwd(), "public", "spotticker-role.yaml");
  const body = await readFile(filePath, "utf8");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/x-yaml",
      "Content-Disposition": 'attachment; filename="spotticker-role.yaml"',
      "Cache-Control": "no-store",
    },
  });
}
