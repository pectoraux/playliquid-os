import { NextRequest, NextResponse } from "next/server";
import { createChannel, listChannels } from "@/lib/playliquid/services/voice";

export const dynamic = "force-dynamic";

// GET /api/services/voice/channels?worldProjectId=
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const worldProjectId = url.searchParams.get("worldProjectId");
  if (!worldProjectId) return NextResponse.json({ error: "worldProjectId required" }, { status: 400 });
  const channels = await listChannels(worldProjectId);
  return NextResponse.json({ worldProjectId, channels });
}

// POST /api/services/voice/channels { worldProjectId, name, spatialModel, maxListeners }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { worldProjectId, name, spatialModel, maxListeners } = body;
  if (!worldProjectId || !name) {
    return NextResponse.json({ error: "worldProjectId and name required" }, { status: 400 });
  }
  const channel = await createChannel(worldProjectId, name, spatialModel ?? "distance", maxListeners ?? 50);
  return NextResponse.json({ ok: true, channel });
}
