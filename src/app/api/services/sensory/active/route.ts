import { NextRequest, NextResponse } from "next/server";
import { getActiveEmissions, clearExpired } from "@/lib/playliquid/services/sensory";

export const dynamic = "force-dynamic";

// GET /api/services/sensory/active?channelId=&x=&y=&z=
// Returns active (non-expired) emissions near the player position, with attenuated intensity.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const channelId = url.searchParams.get("channelId");
  const x = parseFloat(url.searchParams.get("x") ?? "0");
  const y = parseFloat(url.searchParams.get("y") ?? "0");
  const z = parseFloat(url.searchParams.get("z") ?? "0");

  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  // Clean up expired emissions (lazy cleanup)
  await clearExpired(channelId);

  const emissions = await getActiveEmissions(channelId, { x, y, z });
  return NextResponse.json({ channelId, playerPosition: { x, y, z }, emissions });
}
