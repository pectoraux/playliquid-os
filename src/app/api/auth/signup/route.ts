import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/auth/signup — adds the email to the waitlist. Does NOT create a
// User. The admin approves waitlist entries to create real accounts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const name = body.name ? String(body.name).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  // If the email is already an active user, tell them to sign in.
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser && existingUser.status === "ACTIVE") {
    return NextResponse.json(
      { error: "An account with this email already exists. Please sign in." },
      { status: 409 }
    );
  }

  const existing = await db.waitlist.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { ok: true, message: "You're already on the waitlist.", status: existing.status },
      { status: 200 }
    );
  }

  const entry = await db.waitlist.create({ data: { email, name } });
  return NextResponse.json(
    { ok: true, id: entry.id, message: "You're on the waitlist. We'll email you when your account is ready." },
    { status: 201 }
  );
}
