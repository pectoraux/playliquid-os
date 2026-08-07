import { NextRequest, NextResponse } from "next/server";
import { createSession, removeSession, getSessions } from "@/lib/playliquid/state-store";

export const dynamic = "force-dynamic";

// POST /api/runtime/:buildId/session
// body: { action: "join" | "leave", sessionId?, name? }
//
// Session management — players connect and get a session. Other players
// see them join/leave via the SSE stream.
export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const body = await req.json();
  const { action, sessionId, name } = body;

  if (action === "join") {
    const sid = await createSession(buildId, name ?? "Anonymous");
    return NextResponse.json({ sessionId: sid, sessions: getSessions(buildId) });
  }

  if (action === "leave" && sessionId) {
    removeSession(buildId, sessionId);
    return NextResponse.json({ ok: true, sessions: getSessions(buildId) });
  }

  if (action === "list") {
    return NextResponse.json({ sessions: getSessions(buildId) });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
