// ════════════════════════════════════════════════════════════════
// MULTIMODAL COMPILER — Text/Image/Video/Audio → Specification
// ════════════════════════════════════════════════════════════════
//
// Phase P: The multimodal compiler. Takes inputs in multiple
// modalities — text descriptions, reference images, video clips,
// audio descriptions — and compiles them into the canonical
// Specification IR (the same format the text-only pipeline produces).
//
// This is NOT the user-owned LLM flow. The multimodal compiler uses
// the z-ai-web-dev-sdk's VLM (vision), ASR (speech-to-text), and
// video understanding to extract structured descriptions from each
// modality, then combines them into a unified specification.
//
// Pipeline:
//   text ─────────────────────────┐
//   images → VLM → descriptions ──┤
//   video  → VLM → scene desc ────┼→ combined description → Specification IR
//   audio  → ASR → transcript ────┘                       ↓
//                                                  declarative artifact
//
// Each modality's contribution is recorded in the provenance so the
// specification is traceable to its multimodal sources.

import ZAI from "z-ai-web-dev-sdk";
import { nlToSpecification, fallbackSpecification } from "../pipeline";
import { contentHash } from "../hashing";

export interface MultimodalInput {
  text?: string;
  imageUrls?: string[]; // URLs or data: URIs
  videoUrl?: string; // URL or data: URI
  audioBase64?: string; // base64-encoded audio
  family?: string;
}

export interface ModalityContribution {
  modality: "text" | "image" | "video" | "audio";
  source: string; // URL or "text-input" or "audio-base64"
  extractedDescription: string;
  processingMs: number;
  success: boolean;
  error?: string;
}

export interface MultimodalResult {
  specification: Record<string, unknown>;
  artifact: string; // declarative artifact JSON
  combinedDescription: string;
  modalityContributions: ModalityContribution[];
  provenance: {
    modalities: string[];
    generatedAt: string;
    compiler: "playliquid-multimodal";
  };
  hash: string;
}

let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ── Analyze an image with VLM → structured description ──────────
async function analyzeImage(
  imageUrl: string,
  family: string
): Promise<{ description: string; success: boolean; error?: string }> {
  try {
    const zai = await getZAI();
    const prompt = `Analyze this image and describe it as a PlayLiquid package specification. Focus on:
- What object/structure/entity is shown
- Its visual properties: shape, color, size, material
- Its likely function or behavior
- Suggested package family: ${family}

Respond with a concise description (2-4 sentences) that could be used to generate a 3D package.`;

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const description = response.choices[0]?.message?.content ?? "";
    return { description, success: description.length > 0 };
  } catch (e) {
    return { description: "", success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Analyze a video with VLM → scene + motion description ───────
async function analyzeVideo(
  videoUrl: string,
  family: string
): Promise<{ description: string; success: boolean; error?: string }> {
  try {
    const zai = await getZAI();
    const prompt = `Analyze this video and describe the scene for a PlayLiquid package specification. Focus on:
- What objects/entities are present and their motion
- The spatial layout and environment
- Behavioral patterns (movement, interaction, animation)
- Suggested package family: ${family}

Respond with a concise description (2-4 sentences).`;

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "video_url", video_url: { url: videoUrl } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const description = response.choices[0]?.message?.content ?? "";
    return { description, success: description.length > 0 };
  } catch (e) {
    return { description: "", success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Transcribe audio with ASR → text ────────────────────────────
async function transcribeAudio(
  audioBase64: string
): Promise<{ transcript: string; success: boolean; error?: string }> {
  try {
    const zai = await getZAI();
    const response = await zai.audio.asr.create({
      file_base64: audioBase64,
    });
    const transcript = response.text ?? "";
    return { transcript, success: transcript.length > 0 };
  } catch (e) {
    return { transcript: "", success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Compile multimodal inputs → Specification IR + artifact ─────
export async function compileMultimodal(input: MultimodalInput): Promise<MultimodalResult> {
  const contributions: ModalityContribution[] = [];
  const descriptionParts: string[] = [];
  const modalities: string[] = [];

  // ── Text ──────────────────────────────────────────────────────
  if (input.text && input.text.trim().length > 0) {
    const t0 = Date.now();
    contributions.push({
      modality: "text",
      source: "text-input",
      extractedDescription: input.text,
      processingMs: Date.now() - t0,
      success: true,
    });
    descriptionParts.push(input.text);
    modalities.push("text");
  }

  // ── Images ────────────────────────────────────────────────────
  if (input.imageUrls && input.imageUrls.length > 0) {
    for (const url of input.imageUrls) {
      const t0 = Date.now();
      const result = await analyzeImage(url, input.family ?? "building");
      contributions.push({
        modality: "image",
        source: url.slice(0, 100),
        extractedDescription: result.description,
        processingMs: Date.now() - t0,
        success: result.success,
        error: result.error,
      });
      if (result.success && result.description) {
        descriptionParts.push(`[Image reference]: ${result.description}`);
      }
      if (!modalities.includes("image")) modalities.push("image");
    }
  }

  // ── Video ─────────────────────────────────────────────────────
  if (input.videoUrl) {
    const t0 = Date.now();
    const result = await analyzeVideo(input.videoUrl, input.family ?? "building");
    contributions.push({
      modality: "video",
      source: input.videoUrl.slice(0, 100),
      extractedDescription: result.description,
      processingMs: Date.now() - t0,
      success: result.success,
      error: result.error,
    });
    if (result.success && result.description) {
      descriptionParts.push(`[Video reference]: ${result.description}`);
    }
    modalities.push("video");
  }

  // ── Audio ─────────────────────────────────────────────────────
  if (input.audioBase64) {
    const t0 = Date.now();
    const result = await transcribeAudio(input.audioBase64);
    contributions.push({
      modality: "audio",
      source: "audio-base64",
      extractedDescription: result.transcript,
      processingMs: Date.now() - t0,
      success: result.success,
      error: result.error,
    });
    if (result.success && result.transcript) {
      descriptionParts.push(`[Audio description]: ${result.transcript}`);
    }
    modalities.push("audio");
  }

  // ── Combine all modality descriptions into one ────────────────
  const combinedDescription = descriptionParts.join("\n\n");

  if (!combinedDescription.trim()) {
    throw new Error("no modality inputs provided or all failed");
  }

  // ── Compile the combined description → Specification IR ───────
  // Try the LLM-backed specification compiler first; if it fails or
  // returns an empty spec, fall back to the deterministic heuristic
  // compiler so the pipeline never dead-ends.
  let specification: Record<string, unknown>;
  try {
    const specResult = await nlToSpecification(combinedDescription, input.family ?? "building");
    specification = specResult.canonical;
    // If the LLM returned an empty/unparseable spec, use the fallback
    if (!specification || Object.keys(specification).length === 0) {
      specification = fallbackSpecification(combinedDescription);
    }
  } catch {
    specification = fallbackSpecification(combinedDescription);
  }

  // ── Generate the declarative artifact from the specification ──
  // The multimodal compiler produces a DECLARATIVE JSON artifact (the
  // same format the user-owned LLM flow produces), not a markdown
  // description. This artifact is directly executable by the generic
  // package interpreter.
  const family = (specification.family as string) ?? input.family ?? "building";
  const name = (specification.name as string) ?? `@multimodal/${family}/${Date.now()}`;
  const displayName = (specification.displayName as string) ?? "Multimodal Package";
  const artifact = JSON.stringify({
    abiVersion: "1.0.0",
    name,
    displayName,
    family,
    capabilities: (specification.capabilities as string[]) ?? [`${family}.render`],
    provides: ((specification.provides as Array<{ name: string }>) ?? []).map((p) => p.name),
    requires: ((specification.requires as Array<{ name: string }>) ?? []).map((r) => r.name),
    initialState: {
      description: (specification.description as string) ?? combinedDescription.slice(0, 160),
      source: "multimodal-compiler",
    },
    update: { behavior: "static", params: {} },
    render: {
      behavior: "shape",
      params: {
        shape: family === "vehicle" ? "box" : family === "avatar" ? "sphere" : "box",
        size: 5,
        color: "#22d3ee",
      },
    },
  }, null, 2);

  // ── Provenance: which modalities contributed ──────────────────
  const provenance = {
    modalities,
    generatedAt: new Date().toISOString(),
    compiler: "playliquid-multimodal" as const,
  };

  const hash = contentHash({ specification, combinedDescription, provenance });

  return {
    specification,
    artifact,
    combinedDescription,
    modalityContributions: contributions,
    provenance,
    hash,
  };
}
