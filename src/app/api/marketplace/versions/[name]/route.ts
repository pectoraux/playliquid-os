import { NextRequest, NextResponse } from "next/server";
import { listVersions } from "@/lib/playliquid/services/marketplace";

export const dynamic = "force-dynamic";

// GET /api/marketplace/versions/[name] — list all versions of a package
export async function GET(_req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const decodedName = decodeURIComponent(name);
  const versions = await listVersions(decodedName);
  return NextResponse.json({ name: decodedName, versions, count: versions.length });
}
