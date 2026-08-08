import { NextRequest, NextResponse } from "next/server";
import { getOrCreateIdentity, getIdentity, listIdentities, issueCapabilityToken, verifyCapabilityToken } from "@/lib/playliquid/services/identity";

export const dynamic = "force-dynamic";

// GET /api/services/identity?playerId=  OR  ?worldProjectId=  OR  ?verifyToken=token&capability=cap
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const worldProjectId = url.searchParams.get("worldProjectId");
  const verifyToken = url.searchParams.get("verifyToken");
  const capability = url.searchParams.get("capability") ?? undefined;

  if (verifyToken) {
    const result = await verifyCapabilityToken(verifyToken, capability);
    return NextResponse.json(result);
  }
  if (playerId) {
    const identity = await getIdentity(playerId);
    return NextResponse.json({ identity });
  }
  if (worldProjectId) {
    const identities = await listIdentities(worldProjectId);
    return NextResponse.json({ worldProjectId, identities });
  }
  return NextResponse.json({ error: "playerId, worldProjectId, or verifyToken required" }, { status: 400 });
}

// POST /api/services/identity { action: "create"|"token", ... }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;
  try {
    if (action === "create") {
      const { userId, worldProjectId, displayName } = body;
      if (!worldProjectId || !displayName) {
        return NextResponse.json({ error: "worldProjectId and displayName required" }, { status: 400 });
      }
      const identity = await getOrCreateIdentity(userId ?? null, worldProjectId, displayName);
      return NextResponse.json({ ok: true, identity });
    }
    if (action === "token") {
      const { playerId, worldProjectId, capabilities, ttl } = body;
      if (!playerId || !worldProjectId || !Array.isArray(capabilities)) {
        return NextResponse.json({ error: "playerId, worldProjectId, capabilities required" }, { status: 400 });
      }
      const token = await issueCapabilityToken(playerId, worldProjectId, capabilities, ttl);
      return NextResponse.json({ ok: true, token });
    }
    return NextResponse.json({ error: "unknown action: " + action }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "identity error" }, { status: 400 });
  }
}
