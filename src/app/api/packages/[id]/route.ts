import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapPackage } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/packages/:id
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pkg = await db.package.findUnique({
    where: { id },
    include: { provides: true, requires: true, entities: true, generationReq: true },
  });
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  return NextResponse.json(mapPackage(pkg));
}
