import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldBuild } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/world-builds/:id
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const build = await db.worldBuild.findUnique({
    where: { id },
    include: {
      packages: { include: { package: { include: { provides: true, requires: true } } } },
      entities: { include: { package: { include: { provides: true, requires: true } } } },
      nodes: true,
    },
  });
  if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });
  return NextResponse.json(mapWorldBuild(build));
}
