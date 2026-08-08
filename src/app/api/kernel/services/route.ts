import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldService } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/kernel/services — the OS-provided kernel service contracts
// These are the frozen contracts that packages CONSUME. The user's LLM
// never implements these — they are OS substrate.
export async function GET() {
  // The kernel services are canonical (defined in architecture.ts) but we
  // also persist them as WorldService rows so worlds can bind to them.
  let services = await db.worldService.findMany({
    where: { category: { in: ["networking", "persistence", "streaming", "identity"] } },
  });
  return NextResponse.json(services.map(mapWorldService));
}
