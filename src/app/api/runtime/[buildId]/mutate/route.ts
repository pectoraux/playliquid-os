import { NextRequest, NextResponse } from "next/server";
import { initAuthoritativeState, mutateEntityState } from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// POST /api/runtime/:buildId/mutate
// body: { entityId, positionPatch?, statePatch? }
//
// This is how packages mutate authoritative state. The browser runtime's
// KernelContext.requestMovement() and KernelContext.setState() call this
// endpoint. The Kernel owns the state; packages request mutations.
//
// The Kernel decides whether to accept the mutation (future: capability
// enforcement on state access).
export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const body = await req.json();
  const { entityId, positionPatch, statePatch } = body;

  if (!entityId) {
    return NextResponse.json({ error: "entityId is required" }, { status: 400 });
  }

  await initAuthoritativeState(buildId);

  const ok = mutateEntityState(buildId, entityId, { positionPatch, statePatch });
  if (!ok) {
    return NextResponse.json({ error: "Entity not found in authoritative state" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
