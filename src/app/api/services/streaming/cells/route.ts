import { NextRequest, NextResponse } from "next/server";
import { updatePlayerCells, getLoadedCells, removePlayer, CELL_SIZE } from "@/lib/playliquid/services/streaming";

export const dynamic = "force-dynamic";

// GET /api/services/streaming/cells?buildId= — list loaded cells
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const buildId = url.searchParams.get("buildId");
  if (!buildId) return NextResponse.json({ error: "buildId required" }, { status: 400 });
  const cells = getLoadedCells(buildId);
  return NextResponse.json({ buildId, cellSize: CELL_SIZE, loadedCells: cells });
}

// POST /api/services/streaming/cells { action: "update"|"remove", buildId, sessionId, x, z, interestRadius }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, buildId, sessionId } = body;
  if (!buildId || !sessionId) {
    return NextResponse.json({ error: "buildId and sessionId required" }, { status: 400 });
  }
  if (action === "update") {
    const { x, z, interestRadius } = body;
    const result = updatePlayerCells(buildId, sessionId, x ?? 0, z ?? 0, interestRadius ?? 100);
    return NextResponse.json({ ok: true, ...result });
  }
  if (action === "remove") {
    const unloaded = removePlayer(buildId, sessionId);
    return NextResponse.json({ ok: true, unloaded });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
