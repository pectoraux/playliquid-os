import { NextRequest, NextResponse } from "next/server";
import { joinChannel, leaveChannel, listMembers, updatePosition, setSpeaking, setMuted, computeAttenuation } from "@/lib/playliquid/services/voice";

export const dynamic = "force-dynamic";

// GET /api/services/voice/join?channelId=  (list members)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "channelId required" }, { status: 400 });
  const members = await listMembers(channelId);
  return NextResponse.json({ channelId, members });
}

// POST /api/services/voice/join { action: "join"|"leave"|"position"|"speaking"|"muted"|"attenuation", ... }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  try {
    if (action === "join") {
      const { channelId, playerId, position } = body;
      const result = await joinChannel(channelId, playerId, position);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "leave") {
      const { channelId, playerId } = body;
      await leaveChannel(channelId, playerId);
      return NextResponse.json({ ok: true });
    }
    if (action === "position") {
      const { channelId, playerId, position } = body;
      const member = await updatePosition(channelId, playerId, position);
      return NextResponse.json({ ok: true, member });
    }
    if (action === "speaking") {
      const { channelId, playerId, speaking } = body;
      const member = await setSpeaking(channelId, playerId, speaking);
      return NextResponse.json({ ok: true, member });
    }
    if (action === "muted") {
      const { channelId, playerId, muted } = body;
      const member = await setMuted(channelId, playerId, muted);
      return NextResponse.json({ ok: true, member });
    }
    if (action === "attenuation") {
      const { model, listenerPos, speakerPos, maxDistance } = body;
      const gain = computeAttenuation(model, listenerPos, speakerPos, maxDistance);
      return NextResponse.json({ gain });
    }
    return NextResponse.json({ error: "unknown action: " + action }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "voice error" }, { status: 400 });
  }
}
