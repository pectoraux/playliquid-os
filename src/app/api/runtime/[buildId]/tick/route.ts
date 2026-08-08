import { NextResponse } from "next/server";
import { initAuthoritativeState, schedulerTick } from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// POST /api/runtime/:buildId/tick
// Advances the Kernel scheduler by one tick. This mutates authoritative
// state server-side and replicates changes to all connected clients.
//
// In a full system, this would run on a server-side timer. For the MVP,
// any client can trigger a tick (the Kernel is the authority, not the
// client — the client just requests the tick).
export async function POST(_req: Request, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  await initAuthoritativeState(buildId);
  const updated = schedulerTick(buildId);
  return NextResponse.json({ ok: true, entitiesUpdated: updated });
}
