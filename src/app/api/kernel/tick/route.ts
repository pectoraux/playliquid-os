import { NextResponse } from "next/server";
import { tick } from "@/lib/playliquid/kernel";

export const dynamic = "force-dynamic";

// POST /api/kernel/tick — advance the scheduler one tick.
export async function POST() {
  const events = await tick();
  return NextResponse.json({ events, count: events.length });
}
