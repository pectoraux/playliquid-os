import { NextRequest, NextResponse } from "next/server";
import { runGenerationPipeline } from "@/lib/playliquid/pipeline";
import { db } from "@/lib/db";
import { mapPackage } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/generate
// body: { naturalLanguage, worldProjectId?, family }
// Runs the full pipeline: NL → Specification → Resolution → Prompt → User's LLM → Package → Registry
export async function POST(req: NextRequest) {
  const body = await req.json();
  const naturalLanguage: string = body.naturalLanguage;
  const worldProjectId: string | undefined = body.worldProjectId;
  const family: string = body.family ?? "building";

  if (!naturalLanguage) {
    return NextResponse.json({ error: "naturalLanguage is required" }, { status: 400 });
  }

  try {
    const result = await runGenerationPipeline({ naturalLanguage, worldProjectId, family });
    const pkg = await db.package.findUnique({
      where: { id: result.packageId },
      include: { provides: true, requires: true },
    });
    return NextResponse.json(
      {
        requestId: result.requestId,
        specification: result.specification,
        prompt: result.prompt,
        package: pkg ? mapPackage(pkg) : null,
      },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation pipeline failed" },
      { status: 500 }
    );
  }
}
