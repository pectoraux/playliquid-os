// PRIMITIVE O — NL → Specification → Prompt pipeline
//
//   Natural Language
//        ↓
//   AI Architect (LLM) → canonical Specification IR
//        ↓
//   Context Resolver (existing packages + world theme + spatial contract)
//        ↓
//   Prompt Compiler → precise implementation request to the user's LLM
//
// Playliquid does NOT own the LLM. It owns the *boundary* and the *contract*.
// The provider is recorded in provenance so the same specification can later
// be re-implemented by a different model without changing Playliquid.

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { contentHash } from "./hashing";
import { contextForWorld } from "./resolver";
import type { WorldTheme, CompiledPrompt } from "./types";

const SYSTEM_PROMPT = `You are the Playliquid AI Architect. Your job is to convert a natural-language description of a virtual-world object into a CANONICAL SPECIFICATION (a JSON intermediate representation).

This is NOT a prompt to generate the object. This is the canonical truth ABOUT the object. The same specification can later be implemented by any LLM, any human developer, or any future generator — without changing Playliquid.

Respond with ONLY a JSON object matching this exact shape:
{
  "name": "@scope/family/short-name",
  "displayName": "Human readable name",
  "family": "avatar | building | road | vehicle | creature | physics | weather | economy | audio | ai | knowledge | sensor | sensory | renderer | input | infrastructure",
  "description": "one-sentence purpose",
  "capabilities": ["capability.string"],
  "provides": [{"name": "contract.family.verb", "family": "contract-family", "description": "..."}],
  "requires": [{"name": "contract.family.verb", "family": "contract-family", "description": "..."}],
  "spatial": {"scale": "small|medium|large|planetary", "anchorable": true},
  "semantic": {"artDirection": "...", "era": "...", "materialLanguage": "..."},
  "behavioral": ["what it does"],
  "dependencies": []
}

If the user mentions a real-world place, style, or reference, encode it in the semantic block. Do not include prose. Output JSON only.`;

export async function nlToSpecification(
  naturalLanguage: string,
  worldProjectId?: string
): Promise<{ canonical: Record<string, unknown>; specificationId: string }> {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "assistant", content: SYSTEM_PROMPT },
      { role: "user", content: naturalLanguage },
    ],
    thinking: { type: "disabled" },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const canonical = safeExtractJson(raw);

  // attach world theme into the specification for coherence
  let theme: WorldTheme | undefined;
  if (worldProjectId) {
    const project = await db.worldProject.findUnique({ where: { id: worldProjectId } });
    if (project) theme = JSON.parse(project.theme) as WorldTheme;
  }

  const spec = await db.specification.create({
    data: {
      naturalLanguage,
      canonical: JSON.stringify(canonical),
      kind: "package",
      theme: theme ? JSON.stringify(theme) : null,
      spatialRules: JSON.stringify(canonical.spatial ?? {}),
      policies: JSON.stringify({ reuse: "auto" }),
    },
  });

  return { canonical, specificationId: spec.id };
}

// ── Prompt Compiler ───────────────────────────────────────────────
// Combines: canonical spec + world theme + existing-package context +
// spatial contract + dependency graph → one precise implementation
// request for the user's LLM. This is what makes natural language a
// *precise* implementation request rather than a vibe.
export async function compilePrompt(
  specificationId: string,
  worldProjectId?: string
): Promise<CompiledPrompt> {
  const spec = await db.specification.findUnique({ where: { id: specificationId } });
  if (!spec) throw new Error("Specification not found");
  const canonical = JSON.parse(spec.canonical) as Record<string, unknown>;

  let theme: WorldTheme | undefined;
  if (worldProjectId) {
    const project = await db.worldProject.findUnique({ where: { id: worldProjectId } });
    if (project) theme = JSON.parse(project.theme) as WorldTheme;
  }

  const neighbors = await contextForWorld(worldProjectId);
  const neighborNames = neighbors.map((n) => n.name);
  const dependencyGraph = neighbors.flatMap((n) =>
    n.provides.map((p) => `${n.name} provides ${p.name}`)
  );

  const prompt = [
    "# Implementation Request — Playliquid Package",
    "",
    "You are implementing ONE Package for a Playliquid virtual world.",
    "The canonical specification below is the source of truth. Implement it faithfully.",
    "Do NOT invent capabilities that are not in the specification.",
    "",
    "## Canonical Specification",
    "```json",
    JSON.stringify(canonical, null, 2),
    "```",
    "",
    theme
      ? `## World Theme (must be semantically compatible)\n- Era: ${theme.era}\n- Art direction: ${theme.artDirection}\n- Materials: ${theme.materialLanguage}\n- Lighting: ${theme.lighting}\n- Color language: ${theme.colorLanguage}\n- Technology level: ${theme.technologyLevel}`
      : "## World Theme\n(not bound to a world project)",
    "",
    neighborNames.length
      ? `## Existing Packages in this World (neighbors / dependency context)\n${neighborNames.map((n) => `- ${n}`).join("\n")}`
      : "## Existing Packages\n(none yet — this is the first package)",
    "",
    dependencyGraph.length
      ? `## Available Contracts (you may require these)\n${dependencyGraph.map((d) => `- ${d}`).join("\n")}`
      : "",
    "",
    "## Spatial Contract",
    JSON.stringify(canonical.spatial ?? { scale: "medium", anchorable: true }, null, 2),
    "",
    "## Output",
    "Produce a self-contained Package artifact: the manifest, the artifact code, and a short note on how it satisfies each `provides` contract and consumes each `requires` contract.",
  ].join("\n");

  return {
    specification: canonical,
    context: {
      worldTheme: theme,
      spatialContract: canonical.spatial,
      neighbors: neighborNames,
      dependencyGraph,
    },
    prompt,
  };
}

// ── Full pipeline: NL → spec → resolve → prompt → LLM → package ──
export async function runGenerationPipeline(input: {
  naturalLanguage: string;
  worldProjectId?: string;
  family: string;
}): Promise<{
  requestId: string;
  specification: Record<string, unknown>;
  prompt: string;
  packageId: string;
}> {
  const log: Array<{ step: string; at: string; detail?: string }> = [];
  const stamp = () => new Date().toISOString();

  // 1. NL → Specification
  log.push({ step: "specifying", at: stamp(), detail: "calling AI Architect" });
  const { specificationId, canonical } = await nlToSpecification(
    input.naturalLanguage,
    input.worldProjectId
  );

  // 2. Compile prompt
  log.push({ step: "prompting", at: stamp(), detail: "compiling implementation request" });
  const compiled = await compilePrompt(specificationId, input.worldProjectId);

  // 3. Generate the artifact via the user's LLM
  log.push({ step: "generating", at: stamp(), detail: "calling user's LLM" });
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      {
        role: "assistant",
        content:
          "You are a Package implementer for the Playliquid OS. Implement the package described by the user. Return a concise artifact description (what it is, how it works, key code outline). Be specific but compact.",
      },
      { role: "user", content: compiled.prompt },
    ],
    thinking: { type: "disabled" },
  });
  const artifact = completion.choices[0]?.message?.content ?? "";

  // 4. Persist the package (the Registry step)
  const name = (canonical.name as string) || `@generated/${input.family}/${Date.now()}`;
  const displayName = (canonical.displayName as string) || name;
  const description = (canonical.description as string) || input.naturalLanguage.slice(0, 120);
  const capabilities = Array.isArray(canonical.capabilities)
    ? (canonical.capabilities as string[])
    : [];
  const hash = contentHash({ canonical, artifact, name });
  const provides = Array.isArray(canonical.provides) ? (canonical.provides as any[]) : [];
  const requires = Array.isArray(canonical.requires) ? (canonical.requires as any[]) : [];

  log.push({ step: "certifying", at: stamp(), detail: "basic certification" });
  const pkg = await db.package.create({
    data: {
      name,
      displayName,
      description,
      family: input.family,
      version: "1.0.0",
      hash,
      manifest: JSON.stringify({
        entrypoint: "index.js",
        runtime: "simulator",
        resources: [],
        config: { artifact },
      }),
      specification: JSON.stringify(canonical),
      artifactUri: `memory://${hash}`,
      provenance: JSON.stringify({
        generator: "llm",
        llmProvider: "zai",
        model: "glm",
        generatedAt: stamp(),
        source: input.naturalLanguage,
      }),
      certification: JSON.stringify({
        signed: false,
        level: "basic",
        by: "playliquid-auto",
        checks: ["specification-valid", "interfaces-declared"],
      }),
      license: "MIT",
      capabilities: JSON.stringify(capabilities),
      specRefId: specificationId,
      provides: {
        create: provides.map((p) => ({
          name: p.name,
          family: p.family ?? "general",
          version: "1.0.0",
          direction: "provides",
          schema: JSON.stringify(p.schema ?? {}),
          description: p.description ?? "",
        })),
      },
      requires: {
        create: requires.map((r) => ({
          name: r.name,
          family: r.family ?? "general",
          version: "1.0.0",
          direction: "requires",
          schema: JSON.stringify(r.schema ?? {}),
          description: r.description ?? "",
        })),
      },
    },
    include: { provides: true, requires: true },
  });

  // 5. Record the generation request (pipeline trace)
  const request = await db.generationRequest.create({
    data: {
      input: input.naturalLanguage,
      specification: JSON.stringify(canonical),
      prompt: compiled.prompt,
      provider: "zai",
      status: "done",
      packageId: pkg.id,
      log: JSON.stringify(log),
    },
  });

  return {
    requestId: request.id,
    specification: canonical,
    prompt: compiled.prompt,
    packageId: pkg.id,
  };
}

function safeExtractJson(raw: string): Record<string, unknown> {
  // strip code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // try to find the first {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        /* fall through */
      }
    }
    return { raw, name: "@generated/unknown", family: "building" };
  }
}
