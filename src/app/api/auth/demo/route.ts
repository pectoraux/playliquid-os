import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/auth/demo — returns the list of demo accounts available for
// quick-login. Passwords are included so the client can submit them to the
// credentials provider. Demo accounts are identified by the @playliquid.os
// email domain.
export async function GET() {
  const demos = await db.user.findMany({
    where: { email: { endsWith: "@playliquid.os" }, status: "ACTIVE" },
    select: { id: true, email: true, name: true, role: true },
    orderBy: { email: "asc" },
  });
  return NextResponse.json({
    demos: demos.map((d) => ({ ...d, password: "demo" })),
  });
}
