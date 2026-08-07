import { NextRequest, NextResponse } from "next/server";
import { initAuthoritativeState, getActiveCells, CELL_SIZE } from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// GET /api/runtime/:buildId/cells
// Returns the active spatial cells for a world build — used by the
// browser runtime to visualize the streaming cell grid.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  await initAuthoritativeState(buildId);
  const cells = getActiveCells(buildId);
  return NextResponse.json({ cells, cellSize: CELL_SIZE });
}
