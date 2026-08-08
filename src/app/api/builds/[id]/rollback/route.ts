import { NextRequest, NextResponse } from "next/server";
import { rollbackBuild } from "@/lib/playliquid/services/build-pipeline";

export const dynamic = "force-dynamic";

// POST /api/builds/[id]/rollback — revert to this build (undeploys current, deploys target)
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await rollbackBuild(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "rollback failed" }, { status: 400 });
  }
}
