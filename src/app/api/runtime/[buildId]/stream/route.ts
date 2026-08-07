import { NextRequest } from "next/server";
import { initAuthoritativeState, getAuthoritativeState, subscribe, getSessions, createSession } from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// GET /api/runtime/:buildId/stream
// Server-Sent Events stream — pushes authoritative state updates to
// all connected clients in real-time. This is the replication layer.
//
// Two browsers subscribe to the same build → they see the same state
// changes. This is real multiplayer at the state-synchronization level.
export async function GET(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;

  await initAuthoritativeState(buildId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send the initial state snapshot
      const stateMap = getAuthoritativeState(buildId);
      const sessions = getSessions(buildId);
      const snapshot = JSON.stringify({
        type: "snapshot",
        entities: Array.from(stateMap.entries()).map(([id, e]) => ({
          entityId: id,
          position: e.position,
          state: e.state,
        })),
        sessions,
      });
      controller.enqueue(encoder.encode(`data: ${snapshot}\n\n`));

      // Subscribe to updates
      const writer = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // client disconnected
        }
      };
      const unsubscribe = subscribe(buildId, writer);

      // Clean up on close
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
