import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapSpecification } from "@/lib/playliquid/mappers";
import { nlToSpecification, compilePrompt } from "@/lib/playliquid/pipeline";

export const dynamic = "force-dynamic";

// POST /api/specifications
// body: { naturalLanguage, worldProjectId?, kind? }
// Runs NL → canonical IR (via the AI Architect LLM) and returns the spec
// plus the compiled implementation prompt.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const naturalLanguage: string = body.naturalLanguage;
  const worldProjectId: string | undefined = body.worldProjectId;

  if (!naturalLanguage) {
    return NextResponse.json({ error: "naturalLanguage is required" }, { status: 400 });
  }

  const { specificationId, canonical } = await nlToSpecification(naturalLanguage, worldProjectId);
  const compiled = await compilePrompt(specificationId, worldProjectId);
  const spec = await db.specification.findUnique({ where: { id: specificationId } });

  return NextResponse.json(
    {
      specification: spec ? mapSpecification(spec) : { id: specificationId, canonical, kind: "package", createdAt: new Date().toISOString() },
      prompt: compiled.prompt,
      context: compiled.context,
    },
    { status: 201 }
  );
}
