import { NextRequest, NextResponse } from "next/server";
import { listPlacements, getPlacementsForAnchor, registerPlacement, getImpressionsRemaining, type AdPlacement } from "@/lib/playliquid/services/ads";

export const dynamic = "force-dynamic";

// GET /api/services/ads/placements?anchor=  OR  ?playerId=&placementId=  (impressions remaining)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const anchor = url.searchParams.get("anchor");
  const playerId = url.searchParams.get("playerId");
  const placementId = url.searchParams.get("placementId");

  if (playerId && placementId) {
    const remaining = getImpressionsRemaining(playerId, placementId);
    return NextResponse.json({ playerId, placementId, impressionsRemaining: remaining });
  }
  if (anchor) {
    const placements = getPlacementsForAnchor(anchor);
    return NextResponse.json({ anchor, placements });
  }
  const placements = listPlacements();
  return NextResponse.json({ placements });
}

// POST /api/services/ads/placements { id, surface, worldAnchor, frequencyCap, categoryFilter, enabled }
export async function POST(req: NextRequest) {
  const body = await req.json() as AdPlacement;
  if (!body.id || !body.surface || !body.worldAnchor) {
    return NextResponse.json({ error: "id, surface, worldAnchor required" }, { status: 400 });
  }
  registerPlacement(body);
  return NextResponse.json({ ok: true, placement: body });
}
