import { NextRequest, NextResponse } from "next/server";
import { initAuthoritativeState, mutateEntityState } from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// POST /api/runtime/:buildId/move-player
// body: { sessionId, deltaX, deltaZ }
//
// Moves the player's avatar. The avatar entity ID is `avatar-{sessionId}`.
// The Kernel owns the authoritative position; the player requests movement.
export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const body = await req.json();
  const { sessionId, deltaX, deltaZ } = body;

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  await initAuthoritativeState(buildId);

  const avatarId = `avatar-${sessionId}`;
  const ok = mutateEntityState(buildId, avatarId, {
    positionPatch: { x: deltaX, y: 0, z: deltaZ },
  });

  if (!ok) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  // Also update the avatar's direction based on movement
  if (deltaX !== 0 || deltaZ !== 0) {
    const direction = Math.atan2(deltaZ, deltaX);
    mutateEntityState(buildId, avatarId, {
      statePatch: { direction },
    });
  }

  return NextResponse.json({ ok: true });
}
