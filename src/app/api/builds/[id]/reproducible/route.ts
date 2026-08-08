import { NextRequest, NextResponse } from "next/server";
import { verifyReproducible } from "@/lib/playliquid/services/build-pipeline";

export const dynamic = "force-dynamic";

// GET /api/builds/[id]/reproducible — verify the build's manifestLock hash is reproducible
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await verifyReproducible(id);
    return NextResponse.json({ buildId: id, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "verify failed" }, { status: 400 });
  }
}
