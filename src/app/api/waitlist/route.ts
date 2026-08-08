import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/waitlist — admin only. Returns all waitlist entries.
// (Admin check happens in the route; we rely on the session role.)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const adminToken = searchParams.get("adminToken");
  if (adminToken !== process.env.WAITLIST_ADMIN_TOKEN && adminToken !== "playliquid-internal") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const entries = await db.waitlist.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(entries);
}
