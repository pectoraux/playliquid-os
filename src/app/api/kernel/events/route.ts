import { NextRequest, NextResponse } from "next/server";
import { recentEvents } from "@/lib/playliquid/kernel";

export const dynamic = "force-dynamic";

// GET /api/kernel/events?limit=
export async function GET(req: NextRequest) {
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10);
  const events = await recentEvents(Math.min(Math.max(limit, 1), 200));
  return NextResponse.json(events);
}
