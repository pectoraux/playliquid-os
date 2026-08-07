import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldBuild } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/world-builds?projectId=
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const builds = await db.worldBuild.findMany({
    where: projectId ? { worldProjectId: projectId } : undefined,
    include: {
      packages: { include: { package: { include: { provides: true, requires: true } } } },
      entities: { include: { package: { include: { provides: true, requires: true } } } },
      nodes: true,
    },
    orderBy: { version: "desc" },
  });
  return NextResponse.json(builds.map(mapWorldBuild));
}
