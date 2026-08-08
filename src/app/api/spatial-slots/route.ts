import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapSpatialSlot } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/spatial-slots?projectId=
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const slots = await db.spatialSlot.findMany({
    where: projectId ? { worldProjectId: projectId } : undefined,
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(slots.map(mapSpatialSlot));
}

// POST /api/spatial-slots — define a new spatial slot for a world
export async function POST(req: NextRequest) {
  const body = await req.json();
  const slot = await db.spatialSlot.create({
    data: {
      worldProjectId: body.worldProjectId,
      name: body.name,
      displayName: body.displayName ?? body.name,
      slotType: body.slotType ?? "plot",
      bounds: JSON.stringify(body.bounds ?? { x: 0, y: 0, z: 0, w: 100, h: 100, d: 100 }),
      acceptedFamilies: JSON.stringify(body.acceptedFamilies ?? []),
      capacity: body.capacity ?? null,
    },
  });
  return NextResponse.json(mapSpatialSlot(slot), { status: 201 });
}
