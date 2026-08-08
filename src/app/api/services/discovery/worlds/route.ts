import { NextRequest, NextResponse } from "next/server";
import { discoverWorlds } from "@/lib/playliquid/services/discovery";

export const dynamic = "force-dynamic";

// GET /api/services/discovery/worlds?search=&hasRunningNode=true&limit=50&offset=0
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const hasRunningNode = url.searchParams.get("hasRunningNode");
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const result = await discoverWorlds({
    search,
    hasRunningNode: hasRunningNode === null ? undefined : hasRunningNode === "true",
    limit,
    offset,
  });
  return NextResponse.json(result);
}
