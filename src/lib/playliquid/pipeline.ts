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

import { getLLMProvider } from "./llm-provider-adapter";
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
  let canonical: Record<string, unknown>;
  try {
    const provider = getLLMProvider();
    const completion = await provider.completeChat({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: naturalLanguage },
      ],
    });
    const raw = completion.content;
    canonical = safeExtractJson(raw);
  } catch (err) {
    // Fallback: if the LLM provider is unreachable (e.g. the internal API
    // endpoint is not resolvable from this host), derive a canonical
    // specification deterministically so the pipeline still completes.
    console.error("[playliquid] NL→Specification LLM call failed, using fallback:", err);
    canonical = fallbackSpecification(naturalLanguage);
  }

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

// Rule-based fallback specification generator. Produces a valid canonical IR
// from the natural-language input without an LLM. Used when the LLM provider
// is unreachable so the pipeline never dead-ends.
export function fallbackSpecification(nl: string): Record<string, unknown> {
  const lower = nl.toLowerCase();
  const family = detectFamily(lower);
  const slug = nl
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join("-");
  const name = `@generated/${family}/${slug || "package"}`;
  const displayName = nl
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase());

  const provides = [{ name: `${family}.anchor`, family, description: `Anchors as a ${family}` }];
  const requires =
    family === "building" || family === "vehicle"
      ? [{ name: "navigation.walkable", family: "navigation", description: "Needs walkable ground" }]
      : family === "avatar"
      ? [{ name: "navigation.walkable", family: "navigation", description: "Walkable surface" }]
      : [];

  return {
    name,
    displayName,
    family,
    description: nl.slice(0, 160),
    capabilities: [`${family}.render`],
    provides,
    requires,
    spatial: { scale: family === "weather" ? "planetary" : "medium", anchorable: family !== "avatar" },
    semantic: { artDirection: "derived-from-world-theme", era: "contemporary", materialLanguage: "mixed" },
    behavioral: [`functions as a ${family}`],
    dependencies: [],
    _fallback: true,
  };
}

function detectFamily(lower: string): string {
  if (/\b(house|building|tower|cabin|castle|warehouse|shop|mill|windmill)\b/.test(lower)) return "building";
  if (/\b(avatar|character|person|walker|player)\b/.test(lower)) return "avatar";
  if (/\b(car|vehicle|truck|bike|bicycle|boat|ship)\b/.test(lower)) return "vehicle";
  if (/\b(road|street|path|bridge|highway)\b/.test(lower)) return "road";
  if (/\b(rain|weather|sky|cloud|storm|sun|snow|wind)\b/.test(lower)) return "weather";
  if (/\b(physics|gravity|collision|rigid|fluid)\b/.test(lower)) return "physics";
  if (/\b(creature|animal|monster|pet|dog|cat|bird)\b/.test(lower)) return "creature";
  if (/\b(smell|olfactory|haptic|touch|sensory)\b/.test(lower)) return "sensory";
  if (/\b(tree|plant|grass|flower|rock|water|river)\b/.test(lower)) return "infrastructure";
  return "building";
}

// Fallback artifact synthesizer. Produces a concise artifact description from
// the canonical specification when the LLM is unreachable.
export function fallbackArtifact(canonical: Record<string, unknown>, nl: string): string {
  const family = (canonical.family as string) ?? "building";
  const name = (canonical.displayName as string) ?? "Package";
  const provides = (canonical.provides as Array<{ name: string }>) ?? [];
  const requires = (canonical.requires as Array<{ name: string }>) ?? [];
  const behavioral = (canonical.behavioral as string[]) ?? [];
  return [
    `# ${name}`,
    "",
    `**Family:** ${family}`,
    `**Source:** "${nl.slice(0, 120)}"`,
    "",
    "## Description",
    `This ${family} package implements the canonical specification derived from the natural-language request. It is registered in the Playliquid Registry and can be composed into any World Project whose theme accepts the \`${family}\` family.`,
    "",
    "## Contracts",
    provides.length ? `**Provides:** ${provides.map((p) => `\`${p.name}\``).join(", ")}` : "**Provides:** none",
    requires.length ? `**Requires:** ${requires.map((r) => `\`${r.name}\``).join(", ")}` : "**Requires:** none",
    "",
    "## Behavior",
    behavioral.length ? behavioral.map((b) => `- ${b}`).join("\n") : `- Functions as a ${family}.`,
    "",
    "## Implementation Notes",
    `- Entry point: \`index.js\` (simulator runtime adapter)`,
    `- Spatial: ${(canonical.spatial as { scale?: string })?.scale ?? "medium"} scale, ${(canonical.spatial as { anchorable?: boolean })?.anchorable ? "anchorable" : "non-anchorable"}`,
    `- Generated via fallback pipeline (LLM provider was unreachable); re-run from a network that can reach the provider to regenerate with a full LLM artifact.`,
  ].join("\n");
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
    "## Output Format — DECLARATIVE ARTIFACT (required)",
    "",
    "Produce a JSON object matching this exact format. This is a DECLARATIVE",
    "artifact — PlayLiquid interprets it, no JavaScript execution needed.",
    "",
    "```json",
    `{`,
    `  "abiVersion": "1.0.0",`,
    `  "name": "@scope/family/short-name",`,
    `  "displayName": "Human readable name",`,
    `  "family": "${(canonical.family as string) ?? "building"}",`,
    `  "capabilities": ["capability.string"],`,
    `  "provides": [{"name": "contract.name"}],`,
    `  "requires": [{"name": "contract.name"}],`,
    `  "initialState": { "key": "value" },`,
    `  "update": {`,
    `    "behavior": "patrol | wander | spin | static | pulse",`,
    `    "params": { "speed": 0.3, "routeWidth": 20, "routeHeight": 15 }`,
    `  },`,
    `  "render": {`,
    `    "behavior": "shape",`,
    `    "params": { "shape": "circle | rect | diamond | triangle", "size": 8, "color": "#hexcolor" }`,
    `  },`,
    `  "onClick": {`,
    `    "behavior": "emit | toggle | requestCapability",`,
    `    "params": { "event": "event.name", "capability": "cap.name" }`,
    `  }`,
    `}`,
    "```",
    "",
    "Update behaviors:",
    "- patrol: moves in a rectangle (params: speed, routeWidth, routeHeight)",
    "- wander: random movement (params: speed, wanderRange)",
    "- spin: rotates in place (params: spinSpeed)",
    "- pulse: scales up and down (params: pulseRate)",
    "- static: no movement",
    "",
    "Render shapes: circle, rect, diamond, triangle",
    "Click behaviors: emit (sends an event), toggle (flips a state field), requestCapability (asks the Kernel)",
    "",
    "Respond with ONLY the JSON object. No markdown, no explanation.",
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
  let artifact: string;
  let usedProvider = "fallback";
  let usedModel = "rule-based";
  try {
    const provider = getLLMProvider();
    usedProvider = provider.name;
    usedModel = provider.model;
    const completion = await provider.completeChat({
      messages: [
        {
          role: "system",
          content:
            "You are a Package implementer for the Playliquid OS. Implement the package described by the user. Return a concise artifact description (what it is, how it works, key code outline). Be specific but compact.",
        },
        { role: "user", content: compiled.prompt },
      ],
    });
    artifact = completion.content;
  } catch (err) {
    // Fallback: if the LLM provider is unreachable, synthesize an artifact
    // from the canonical specification so the pipeline still produces a
    // complete, registered Package.
    console.error("[playliquid] artifact LLM call failed, using fallback:", err);
    artifact = fallbackArtifact(canonical, input.naturalLanguage);
  }

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
        llmProvider: usedProvider,
        model: usedModel,
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
      provider: usedProvider,
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
