import { NextRequest, NextResponse } from "next/server";
import { resolveReuseFirst } from "@/lib/playliquid/reuse-engine";
import type { ReusePolicy } from "@/lib/playliquid/types";

export const dynamic = "force-dynamic";

// POST /api/reuse
// body: { naturalLanguage, canonical, worldProjectId?, policy?, neverReuseFamilies? }
// Decomposes a spec into sub-packages, searches the Registry for each with
// theme/style/era scoring, and returns which can be reused vs which must be
// generated — respecting the creator's reuse policy.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { naturalLanguage, canonical, worldProjectId } = body;
  const policy: ReusePolicy = body.policy ?? "prefer-existing";
  const neverReuseFamilies: string[] = body.neverReuseFamilies ?? [];

  if (!naturalLanguage && !canonical) {
    return NextResponse.json({ error: "naturalLanguage or canonical is required" }, { status: 400 });
  }
  try {
    const result = await resolveReuseFirst({
      naturalLanguage: naturalLanguage ?? "",
      canonical: canonical ?? {},
      worldProjectId,
      policy,
      neverReuseFamilies,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "reuse resolution failed" },
      { status: 400 }
    );
  }
}
