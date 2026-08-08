import { NextRequest, NextResponse } from "next/server";
import { publishVersion } from "@/lib/playliquid/services/marketplace";

export const dynamic = "force-dynamic";

// POST /api/marketplace/publish
// { packageName, displayName, description, family, version, artifact, changelog, license, publishedBy, capabilities }
export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const result = await publishVersion(body);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "publish failed" }, { status: 400 });
  }
}
