import { NextRequest, NextResponse } from "next/server";
import { transfer } from "@/lib/playliquid/services/economy";

export const dynamic = "force-dynamic";

// POST /api/services/economy/transfer { fromPlayerId, toPlayerId, worldProjectId, amount, reason, reference, currency }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { fromPlayerId, toPlayerId, worldProjectId, amount, reason, reference, currency = "PL" } = body;
  if (!fromPlayerId || !toPlayerId || !worldProjectId || !amount) {
    return NextResponse.json({ error: "fromPlayerId, toPlayerId, worldProjectId, amount required" }, { status: 400 });
  }
  try {
    const result = await transfer(fromPlayerId, toPlayerId, worldProjectId, amount, reason, reference, currency);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "transfer failed" }, { status: 400 });
  }
}
