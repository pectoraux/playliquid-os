import { NextRequest, NextResponse } from "next/server";
import { getOrCreateWallet, getBalance, mint, burn } from "@/lib/playliquid/services/economy";

export const dynamic = "force-dynamic";

// GET /api/services/economy/wallet?playerId=&worldProjectId=&currency=PL
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const worldProjectId = url.searchParams.get("worldProjectId");
  const currency = url.searchParams.get("currency") ?? "PL";
  if (!playerId || !worldProjectId) {
    return NextResponse.json({ error: "playerId and worldProjectId required" }, { status: 400 });
  }
  const balance = await getBalance(playerId, worldProjectId, currency);
  return NextResponse.json({ playerId, worldProjectId, currency, balance });
}

// POST /api/services/economy/wallet { action: "mint"|"burn"|"create", playerId, worldProjectId, amount, reason, reference, currency }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, playerId, worldProjectId, amount, reason, reference, currency = "PL" } = body;
  if (!playerId || !worldProjectId) {
    return NextResponse.json({ error: "playerId and worldProjectId required" }, { status: 400 });
  }
  try {
    if (action === "create") {
      const wallet = await getOrCreateWallet(playerId, worldProjectId, currency);
      return NextResponse.json({ ok: true, wallet });
    }
    if (action === "mint") {
      const result = await mint(playerId, worldProjectId, amount, reason, reference, currency);
      return NextResponse.json({ ok: true, ...result });
    }
    if (action === "burn") {
      const result = await burn(playerId, worldProjectId, amount, reason, reference, currency);
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json({ error: "unknown action: " + action }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "economy error" }, { status: 400 });
  }
}
