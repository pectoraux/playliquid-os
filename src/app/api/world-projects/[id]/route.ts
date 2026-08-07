import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldProject } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/world-projects/:id
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await db.worldProject.findUnique({
    where: { id },
    include: {
      specification: true,
      builds: {
        include: {
          packages: { include: { package: { include: { provides: true, requires: true } } } },
          nodes: true,
          entities: { include: { package: { include: { provides: true, requires: true } } } },
        },
        orderBy: { version: "desc" },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "World Project not found" }, { status: 404 });
  return NextResponse.json(mapWorldProject(project));
}
