import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/auth/session — returns the current session or null.
// (NextAuth provides one at /api/auth/session already, but this wrapper makes
//  the role/status explicit for our client.)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: (session.user as { id?: string }).id,
      email: session.user.email,
      name: session.user.name,
      role: (session.user as { role?: string }).role,
      status: (session.user as { status?: string }).status,
    },
  });
}
