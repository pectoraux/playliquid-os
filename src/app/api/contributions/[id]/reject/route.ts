import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapContribution } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// POST /api/contributions/:id/reject
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const c = await db.contribution.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Contribution not found" }, { status: 404 });

  const updated = await db.contribution.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewNote: body.note ?? null,
      reviewedAt: new Date(),
      reviewedBy: "maintainer",
    },
    include: { package: { include: { provides: true, requires: true } } },
  });
  return NextResponse.json(mapContribution(updated));
}
