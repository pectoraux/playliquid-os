import { NextRequest, NextResponse } from "next/server";
import { compileMultimodal, type MultimodalInput } from "@/lib/playliquid/services/multimodal-compiler";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // multimodal analysis can take time

// POST /api/multimodal/compile
// Body: { text?, imageUrls?: string[], videoUrl?: string, audioBase64?: string, family?: string }
// Returns: { specification, artifact, combinedDescription, modalityContributions, provenance, hash }
export async function POST(req: NextRequest) {
  const body = await req.json() as MultimodalInput;

  // Validate: at least one modality must be provided
  if (!body.text && !body.imageUrls?.length && !body.videoUrl && !body.audioBase64) {
    return NextResponse.json(
      { error: "at least one modality input is required (text, imageUrls, videoUrl, or audioBase64)" },
      { status: 400 }
    );
  }

  try {
    const result = await compileMultimodal(body);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "multimodal compilation failed" },
      { status: 500 }
    );
  }
}
