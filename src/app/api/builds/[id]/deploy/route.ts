import { NextRequest, NextResponse } from "next/server";
import { deployBuild } from "@/lib/playliquid/services/build-pipeline";

export const dynamic = "force-dynamic";

// POST /api/builds/[id]/deploy — set this build as the active deployment
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await deployBuild(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "deploy failed" }, { status: 400 });
  }
}
