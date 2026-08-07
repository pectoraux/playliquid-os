import { NextResponse } from "next/server";
import { ARCHITECTURE } from "@/lib/playliquid/architecture";

export const dynamic = "force-dynamic";

// GET /api/architecture — the frozen manifest of primitives, pipelines, laws, extension table.
export async function GET() {
  return NextResponse.json(ARCHITECTURE);
}
