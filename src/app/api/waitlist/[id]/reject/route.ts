import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/waitlist/:id/reject — admin rejects a waitlist entry.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const entry = await db.waitlist.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 });

  await db.waitlist.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedBy: session.user.email ?? "admin" },
  });

  return NextResponse.json({ ok: true });
}
