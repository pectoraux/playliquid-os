import { NextRequest, NextResponse } from "next/server";
import { createChannel, listChannels } from "@/lib/playliquid/services/sensory";

export const dynamic = "force-dynamic";

// GET /api/services/sensory/channels?worldProjectId=
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const worldProjectId = url.searchParams.get("worldProjectId");
  if (!worldProjectId) return NextResponse.json({ error: "worldProjectId required" }, { status: 400 });
  const channels = await listChannels(worldProjectId);
  return NextResponse.json({ worldProjectId, channels });
}

// POST /api/services/sensory/channels { worldProjectId, name, channelType, maxRange }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { worldProjectId, name, channelType, maxRange } = body;
  if (!worldProjectId || !name) {
    return NextResponse.json({ error: "worldProjectId and name required" }, { status: 400 });
  }
  const channel = await createChannel(worldProjectId, name, channelType ?? "olfactory", maxRange ?? 50);
  return NextResponse.json({ ok: true, channel }, { status: 201 });
}
