import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldNode } from "@/lib/playliquid/mappers";
import { emitEvent } from "@/lib/playliquid/kernel";
import type { NodeHost } from "@/lib/playliquid/types";

export const dynamic = "force-dynamic";

// GET /api/world-nodes?buildId=
export async function GET(req: NextRequest) {
  const buildId = req.nextUrl.searchParams.get("buildId");
  const nodes = await db.worldNode.findMany({
    where: buildId ? { worldBuildId: buildId } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(nodes.map(mapWorldNode));
}

// POST /api/world-nodes
// body: { worldBuildId, host }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const worldBuildId: string = body.worldBuildId;
  const host: NodeHost = body.host ?? "local";

  if (!worldBuildId) {
    return NextResponse.json({ error: "worldBuildId is required" }, { status: 400 });
  }

  const build = await db.worldBuild.findUnique({ where: { id: worldBuildId } });
  if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });

  const node = await db.worldNode.create({
    data: {
      worldBuildId,
      host,
      endpoint: `/worlds/builds/${build.hash.slice(0, 8)}`,
      status: "stopped",
      health: JSON.stringify({}),
      capabilities: JSON.stringify({}),
    },
  });
  await emitEvent("node.created", { nodeId: node.id, host });
  return NextResponse.json(mapWorldNode(node), { status: 201 });
}
