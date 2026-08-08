import { NextRequest, NextResponse } from "next/server";
import { runAuction, type AdBid } from "@/lib/playliquid/services/ads";

export const dynamic = "force-dynamic";

// POST /api/services/ads/auction { playerId, placementId, bids: AdBid[] }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { playerId, placementId, bids } = body;
  if (!playerId || !placementId || !Array.isArray(bids)) {
    return NextResponse.json({ error: "playerId, placementId, bids required" }, { status: 400 });
  }
  const result = runAuction(playerId, placementId, bids as AdBid[]);
  return NextResponse.json(result);
}
