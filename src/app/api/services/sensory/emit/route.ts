import { NextRequest, NextResponse } from "next/server";
import { emitSensory } from "@/lib/playliquid/services/sensory";

export const dynamic = "force-dynamic";

// POST /api/services/sensory/emit { channelId, entityId, intensity, position, payload, durationMs }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { channelId, entityId, intensity, position, payload, durationMs } = body;
  if (!channelId || !entityId || !position) {
    return NextResponse.json({ error: "channelId, entityId, position required" }, { status: 400 });
  }
  const emission = await emitSensory(channelId, entityId, intensity ?? 1.0, position, payload ?? {}, durationMs ?? null);
  return NextResponse.json({ ok: true, emission }, { status: 201 });
}
