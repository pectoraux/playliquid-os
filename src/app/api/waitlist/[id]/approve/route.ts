import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/waitlist/:id/approve — admin approves a waitlist entry.
// Creates a User account with a default password and marks the entry approved.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getServerSession(authOptions);
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const entry = await db.waitlist.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Waitlist entry not found" }, { status: 404 });
  if (entry.status === "APPROVED") {
    return NextResponse.json({ error: "Already approved" }, { status: 400 });
  }

  // Default password for newly approved accounts; users can change it later.
  const defaultPassword = "Playliquid2025";
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  const user = await db.user.create({
    data: {
      email: entry.email,
      name: entry.name ?? null,
      passwordHash,
      role: "USER",
      status: "ACTIVE",
    },
  });

  await db.waitlist.update({
    where: { id },
    data: { status: "APPROVED", reviewedAt: new Date(), reviewedBy: session.user.email ?? "admin", userId: user.id },
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email,
    defaultPassword,
    message: `Account created for ${user.email}. Default password: ${defaultPassword}`,
  });
}
