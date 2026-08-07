import { NextRequest } from "next/server";
import {
  initAuthoritativeState,
  getAuthoritativeState,
  getEntitiesInInterest,
  getSessions,
  subscribe,
  getActiveCells,
} from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// GET /api/runtime/:buildId/stream?x=&z=&radius=
// Server-Sent Events stream — pushes authoritative state updates to
// all connected clients in real-time.
//
// Phase D: If x, z, and radius are provided, the stream is
// interest-filtered — only entities within the player's interest
// region are sent. This is spatial streaming: the browser only holds
// entities in its interest cells.
export async function GET(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;

  // Parse interest region (optional)
  const url = new URL(req.url);
  const x = url.searchParams.get("x");
  const z = url.searchParams.get("z");
  const radius = url.searchParams.get("radius");
  const hasInterest = x !== null && z !== null;

  await initAuthoritativeState(buildId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // Send the initial state snapshot
      const sessions = getSessions(buildId);
      const activeCells = getActiveCells(buildId);

      let entities: Array<{ entityId: string; position: { x: number; y: number; z: number }; state: Record<string, unknown>; cell: string }>;
      if (hasInterest) {
        // Interest-filtered: only send entities in the player's interest region
        entities = getEntitiesInInterest(buildId, parseFloat(x!), parseFloat(z!), parseFloat(radius ?? "100"));
      } else {
        // No interest filter: send all entities
        const stateMap = getAuthoritativeState(buildId);
        entities = Array.from(stateMap.entries()).map(([id, e]) => ({
          entityId: id,
          position: e.position,
          state: e.state,
          cell: "",
        }));
      }

      const snapshot = JSON.stringify({
        type: "snapshot",
        entities,
        sessions,
        activeCells,
        streaming: hasInterest,
        interestRegion: hasInterest ? { x: parseFloat(x!), z: parseFloat(z!), radius: parseFloat(radius ?? "100") } : null,
      });
      controller.enqueue(encoder.encode(`data: ${snapshot}\n\n`));

      // Subscribe to updates
      const writer = (data: string) => {
        try {
          // Phase D: if interest-filtered, only send updates for entities
          // in the player's interest region
          if (hasInterest) {
            try {
              const msg = JSON.parse(data);
              if (msg.type === "state" && msg.position) {
                const interestCells = getEntitiesInInterest(buildId, parseFloat(x!), parseFloat(z!), parseFloat(radius ?? "100"));
                const inInterest = interestCells.some((e) => e.entityId === msg.entityId);
                if (!inInterest) return; // skip — entity outside interest
              }
            } catch { /* if we can't parse, send it anyway */ }
          }
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
