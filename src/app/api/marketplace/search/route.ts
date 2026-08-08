import { NextRequest, NextResponse } from "next/server";
import { searchMarketplace, listValidLicenses } from "@/lib/playliquid/services/marketplace";

export const dynamic = "force-dynamic";

// GET /api/marketplace/search?q=&family=&certificationLevel=&sortBy=recent&limit=50&offset=0
// GET /api/marketplace/search?licenses=true  (list valid SPDX licenses)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("licenses") === "true") {
    return NextResponse.json({ licenses: listValidLicenses() });
  }
  const result = await searchMarketplace({
    query: url.searchParams.get("q") ?? undefined,
    family: url.searchParams.get("family") ?? undefined,
    certificationLevel: url.searchParams.get("certificationLevel") ?? undefined,
    sortBy: (url.searchParams.get("sortBy") as any) ?? "recent",
    limit: parseInt(url.searchParams.get("limit") ?? "50", 10),
    offset: parseInt(url.searchParams.get("offset") ?? "0", 10),
  });
  return NextResponse.json(result);
}
