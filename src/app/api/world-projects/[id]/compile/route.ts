import { NextRequest, NextResponse } from "next/server";
import { compileWorldBuild } from "@/lib/playliquid/services/world-project-compiler";
import { db } from "@/lib/db";
import { contentHash } from "@/lib/playliquid/hashing";

export const dynamic = "force-dynamic";

// POST /api/world-projects/[id]/compile — compile the project's accepted contributions into a World Build
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const branchName = body.branchName ?? "main";

  try {
    const result = await compileWorldBuild(id, branchName);

    // Create a WorldBuild from the compilation
    const latestBuild = await db.worldBuild.findFirst({
      where: { worldProjectId: id },
      orderBy: { version: "desc" },
    });
    const nextVersion = (latestBuild?.version ?? 0) + 1;

    const build = await db.worldBuild.create({
      data: {
        worldProjectId: id,
        version: nextVersion,
        manifest: JSON.stringify(result.manifest),
        manifestLock: JSON.stringify({
          buildHash: result.buildHash,
          entityCount: result.entityCount,
          anchorCount: result.anchorCount,
          worldGraphNodes: result.worldGraph.length,
          navigationEdges: result.navigationGraph.length,
          conflicts: !result.conflictsResolved,
        }),
        hash: result.buildHash,
        branchName,
        status: result.conflictsResolved ? "ready" : "draft",
      },
    });

    return NextResponse.json({
      ok: true,
      buildId: build.id,
      buildVersion: nextVersion,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "compilation failed" },
      { status: 500 }
    );
  }
}
