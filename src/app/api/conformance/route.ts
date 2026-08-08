import { NextResponse } from "next/server";
import { runConformanceSuite } from "@/lib/playliquid/conformance-suite";

export const dynamic = "force-dynamic";

// GET /api/conformance
// Runs the PlayLiquid Conformance Suite — automated tests that prove
// architectural properties through actual runtime behavior.
export async function GET() {
  const suite = runConformanceSuite();
  return NextResponse.json(suite);
}
