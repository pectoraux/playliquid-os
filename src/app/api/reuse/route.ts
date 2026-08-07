import { NextRequest, NextResponse } from "next/server";
import { resolveReuseFirst } from "@/lib/playliquid/reuse-engine";

export const dynamic = "force-dynamic";

// POST /api/reuse
// body: { naturalLanguage, canonical, worldProjectId? }
// Decomposes a spec into sub-packages, searches the Registry for each,
// and returns which can be reused vs which must be generated.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { naturalLanguage, canonical, worldProjectId } = body;
  if (!naturalLanguage && !canonical) {
    return NextResponse.json({ error: "naturalLanguage or canonical is required" }, { status: 400 });
  }
  try {
    const result = await resolveReuseFirst({
      naturalLanguage: naturalLanguage ?? "",
      canonical: canonical ?? {},
      worldProjectId,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "reuse resolution failed" },
      { status: 400 }
    );
  }
}
