import { NextRequest, NextResponse } from "next/server";
import { validateContribution } from "@/lib/playliquid/services/world-project-compiler";

export const dynamic = "force-dynamic";

// POST /api/contributions/[id]/validate — validate a contribution (certification + anchor alignment + slot capacity)
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const result = await validateContribution(id);
    return NextResponse.json({ contributionId: id, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "validation failed" },
      { status: 500 }
    );
  }
}
