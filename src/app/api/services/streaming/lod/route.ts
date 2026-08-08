import { NextRequest, NextResponse } from "next/server";
import { computeEntityLODs, computeLOD, lodLabel, LOD_THRESHOLDS } from "@/lib/playliquid/services/streaming";

export const dynamic = "force-dynamic";

// POST /api/services/streaming/lod { entities: [{entityId, position}], playerPos: {x,y,z} }
// Returns LOD level for each entity relative to the player.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { entities, playerPos } = body;
  if (!Array.isArray(entities) || !playerPos) {
    return NextResponse.json({ error: "entities[] and playerPos required" }, { status: 400 });
  }
  const lods = computeEntityLODs(entities, playerPos);
  return NextResponse.json({
    playerPos,
    thresholds: LOD_THRESHOLDS,
    entityLODs: lods,
    culledCount: entities.length - lods.length,
  });
}

// GET /api/services/streaming/lod — compute LOD for a single entity
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const ex = parseFloat(url.searchParams.get("ex") ?? "0");
  const ey = parseFloat(url.searchParams.get("ey") ?? "0");
  const ez = parseFloat(url.searchParams.get("ez") ?? "0");
  const px = parseFloat(url.searchParams.get("px") ?? "0");
  const py = parseFloat(url.searchParams.get("py") ?? "0");
  const pz = parseFloat(url.searchParams.get("pz") ?? "0");
  const { lod, distance } = computeLOD({ x: ex, y: ey, z: ez }, { x: px, y: py, z: pz });
  return NextResponse.json({ lod, lodLabel: lodLabel(lod), distance, thresholds: LOD_THRESHOLDS });
}
