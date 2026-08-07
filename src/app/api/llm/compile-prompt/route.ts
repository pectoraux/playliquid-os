import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nlToSpecification, compilePrompt } from "@/lib/playliquid/pipeline";
import { getOpenTargets } from "@/lib/playliquid/user-llm-boundary";

export const dynamic = "force-dynamic";

// POST /api/llm/compile-prompt
// body: { naturalLanguage, worldProjectId? }
//
// This is the USER-OWNED LLM flow. PlayLiquid:
//   1. Converts NL → canonical Specification (AI Architect — this is the OS's job)
//   2. Compiles the implementation prompt
//   3. Returns the prompt + "open in ChatGPT/Claude/Gemini/Z.ai" targets
//
// The user takes the prompt to THEIR LLM, generates the implementation,
// then imports it back via /api/llm/import-package.
//
// The server-side LLMProviderAdapter is NOT used here. PlayLiquid doesn't
// need the user's LLM API key.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { naturalLanguage, worldProjectId } = body;

  if (!naturalLanguage) {
    return NextResponse.json({ error: "naturalLanguage is required" }, { status: 400 });
  }

  try {
    // 1. NL → Specification (the AI Architect — this uses the server-side
    //    provider because it's producing the CANONICAL SPECIFICATION, which
    //    is the OS's responsibility, not the user's LLM's job)
    const { specificationId } = await nlToSpecification(naturalLanguage, worldProjectId);

    // 2. Compile the implementation prompt
    const compiled = await compilePrompt(specificationId, worldProjectId);

    // 3. Return the prompt + open targets
    return NextResponse.json({
      specificationId,
      specification: compiled.specification,
      prompt: compiled.prompt,
      openTargets: getOpenTargets(compiled.prompt),
      instructions: "Copy the prompt above, open it in your LLM of choice, generate the package implementation, then paste the result back via the Import Package flow.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "compile-prompt failed" },
      { status: 500 }
    );
  }
}
