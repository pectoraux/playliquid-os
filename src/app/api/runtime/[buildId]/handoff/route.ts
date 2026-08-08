import { NextRequest, NextResponse } from "next/server";
import { findNodeForPosition, findNodeByZone, recordHandoff } from "@/lib/playliquid/zone-registry";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// HANDOFF COORDINATOR — transparent entity transfer between nodes.
//
//   POST /api/runtime/:buildId/handoff
//
// Phase I: when a player crosses a zone boundary, the source node calls
// this endpoint. The coordinator:
//   1. Finds the target node that owns the entity's new position
//   2. Forwards the entity state to the target node's /handoff/incoming
//   3. Records the handoff (audit trail)
//   4. Returns the target node's WS port so the source can tell the
//      client to switch connections
//
// The entity's ID, state, session, and package are ALL preserved. The
// player never knows the handoff happened.
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  let body: {
    entityId: string;
    sessionId?: string;
    position: { x: number; y: number; z: number };
    state: Record<string, unknown>;
    seq: number;
    fromZoneId: string;
    declarativeArtifact?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.entityId || !body.position) {
    return NextResponse.json({ error: "entityId and position are required" }, { status: 400 });
  }

  // 1. Find the target node for the entity's new position
  const targetNode = findNodeForPosition(buildId, body.position.x, body.position.z);
  if (!targetNode) {
    return NextResponse.json(
      { error: "No node owns the target position", position: body.position },
      { status: 404 }
    );
  }

  // Don't hand off to yourself
  if (targetNode.zoneId === body.fromZoneId) {
    return NextResponse.json({ ok: true, sameZone: true, zoneId: targetNode.zoneId });
  }

  // 2. Forward the entity state to the target node's /handoff/incoming
  try {
    const res = await fetch(`${targetNode.httpUrl}/handoff/incoming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId: body.entityId,
        sessionId: body.sessionId,
        position: body.position,
        state: body.state,
        seq: body.seq,
        declarativeArtifact: body.declarativeArtifact,
        fromZoneId: body.fromZoneId,
        zoneId: targetNode.zoneId,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Target node rejected handoff: HTTP ${res.status}: ${txt}` },
        { status: 502 }
      );
    }

    const ack = await res.json();

    // 3. Record the handoff (audit trail)
    recordHandoff({
      entityId: body.entityId,
      sessionId: body.sessionId,
      fromZoneId: body.fromZoneId,
      toZoneId: targetNode.zoneId,
      position: body.position,
      state: body.state,
      seq: body.seq,
      timestamp: Date.now(),
    });

    // 4. Return the target node's WS port so the source can tell the client
    return NextResponse.json({
      ok: true,
      entityId: body.entityId,
      fromZoneId: body.fromZoneId,
      toZoneId: targetNode.zoneId,
      toNodeWsPort: targetNode.wsPort,
      toNodeHttpUrl: targetNode.httpUrl,
      targetAck: ack,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to reach target node: ${e instanceof Error ? e.message : e}` },
      { status: 502 }
    );
  }
}
