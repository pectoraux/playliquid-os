import { NextRequest, NextResponse } from "next/server";
import { sendSignal, pollSignals, getChannelPeers } from "@/lib/playliquid/services/voice";

export const dynamic = "force-dynamic";

// GET /api/services/voice/webrtc?action=poll&playerId=  (poll for pending signals)
// GET /api/services/voice/webrtc?action=peers&channelId=&playerId=  (get peers to connect to)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const playerId = url.searchParams.get("playerId");

  if (action === "poll" && playerId) {
    const signals = await pollSignals(playerId);
    return NextResponse.json({ playerId, signals });
  }

  if (action === "peers") {
    const channelId = url.searchParams.get("channelId");
    if (!channelId || !playerId) {
      return NextResponse.json({ error: "channelId and playerId required" }, { status: 400 });
    }
    const peers = await getChannelPeers(channelId, playerId);
    return NextResponse.json(peers);
  }

  return NextResponse.json({ error: "action required (poll or peers)" }, { status: 400 });
}

// POST /api/services/voice/webrtc { type, channelId, fromPlayerId, toPlayerId, payload }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, channelId, fromPlayerId, toPlayerId, payload } = body;
  if (!type || !channelId || !fromPlayerId || !toPlayerId) {
    return NextResponse.json({ error: "type, channelId, fromPlayerId, toPlayerId required" }, { status: 400 });
  }
  try {
    const result = await sendSignal(channelId, fromPlayerId, toPlayerId, type, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "signal failed" }, { status: 400 });
  }
}
