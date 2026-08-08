import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapEntity } from "@/lib/playliquid/mappers";
import { spawnEntity } from "@/lib/playliquid/kernel";

export const dynamic = "force-dynamic";

// GET /api/entities?buildId=
export async function GET(req: NextRequest) {
  const buildId = req.nextUrl.searchParams.get("buildId");
  const entities = await db.entity.findMany({
    where: buildId ? { worldBuildId: buildId } : undefined,
    include: { package: { include: { provides: true, requires: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(entities.map(mapEntity));
}

// POST /api/entities
// body: { worldBuildId, packageId, name, position?, components? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { worldBuildId, packageId, name } = body;
  if (!worldBuildId || !packageId || !name) {
    return NextResponse.json(
      { error: "worldBuildId, packageId and name are required" },
      { status: 400 }
    );
  }
  const position = body.position ?? { x: Math.random() * 24, y: 0, z: Math.random() * 24 };
  const components = body.components ?? ["transform", "renderable"];
  const entity = await spawnEntity({ worldBuildId, packageId, name, position, components });
  const full = await db.entity.findUnique({
    where: { id: entity.id },
    include: { package: { include: { provides: true, requires: true } } },
  });
  return NextResponse.json(mapEntity(full!), { status: 201 });
}
