import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldNode } from "@/lib/playliquid/mappers";
import { startNode } from "@/lib/playliquid/kernel";

export const dynamic = "force-dynamic";

// POST /api/world-nodes/:id/start
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await startNode(id);
    const node = await db.worldNode.findUnique({ where: { id } });
    if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
    return NextResponse.json(mapWorldNode(node));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to start node" },
      { status: 400 }
    );
  }
}
