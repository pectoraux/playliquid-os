import { NextRequest, NextResponse } from "next/server";
import { getTransactionHistory } from "@/lib/playliquid/services/economy";

export const dynamic = "force-dynamic";

// GET /api/services/economy/history?playerId=&worldProjectId=&currency=PL&limit=50
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const worldProjectId = url.searchParams.get("worldProjectId");
  const currency = url.searchParams.get("currency") ?? "PL";
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  if (!playerId || !worldProjectId) {
    return NextResponse.json({ error: "playerId and worldProjectId required" }, { status: 400 });
  }
  const transactions = await getTransactionHistory(playerId, worldProjectId, currency, limit);
  return NextResponse.json({ playerId, currency, transactions });
}
