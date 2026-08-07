// PRIMITIVE #1 (Registry) — Reuse-first generation
//
//   User request
//       ↓
//   World Specification
//       ↓
//   Package Decomposition  (break into sub-packages)
//       ↓
//   Registry Search  (per sub-package)
//       ↓
//   ┌───────────────────────┐
//   │ Existing?             │
//   └───────┬───────────────┘
//        yes│            │no
//           ↓            ↓
//        Reuse       Generate (only missing)
//                        │
//                  User's LLM
//                        │
//                        ↓
//                     Package
//                        │
//                        ↓
//                    Registry
//
// The second user who wants a castle should NOT regenerate it. The Registry
// is the shared implementation memory of the entire platform.

import { db } from "@/lib/db";
import { mapPackage } from "./mappers";
import type { PackageRecord, ReuseFirstResult, WorldTheme } from "./types";

interface DecomposeInput {
  naturalLanguage: string;
  canonical: Record<string, unknown>;
  worldProjectId?: string;
}

// Decompose a top-level specification into sub-package specifications.
// E.g. "a medieval village" → [castle, house, road, tree, well].
// In the full vision this is an LLM call; here we use a rule-based
// decomposition keyed on the canonical spec's family + capabilities.
export function decomposeSpecification(input: DecomposeInput): Array<{
  subSpec: Record<string, unknown>;
  family: string;
  role: string;
}> {
  const family = (input.canonical.family as string) ?? "building";
  const capabilities = (input.canonical.capabilities as string[]) ?? [];
  const name = (input.canonical.name as string) ?? input.naturalLanguage.slice(0, 40);

  // If the spec is already atomic (a single building/road/avatar), return it.
  const atomicFamilies = ["building", "road", "avatar", "vehicle", "creature", "weather", "physics", "sensory"];
  if (atomicFamilies.includes(family)) {
    return [{ subSpec: input.canonical, family, role: "primary" }];
  }

  // Otherwise decompose into a package graph.
  // For a "village" or "city" spec, break into structural + content packages.
  const decomposition: Array<{ subSpec: Record<string, unknown>; family: string; role: string }> = [];

  // Always include infrastructure if not present
  decomposition.push({
    subSpec: {
      name: `${name}/roads`,
      family: "road",
      displayName: `Roads for ${name}`,
      capabilities: ["road.path", "navigation.walkable"],
      provides: [{ name: "navigation.walkable", family: "navigation" }],
      requires: [{ name: "spatial.anchor", family: "spatial" }],
    },
    family: "road",
    role: "infrastructure",
  });

  decomposition.push({
    subSpec: {
      name: `${name}/physics`,
      family: "physics",
      displayName: `Physics for ${name}`,
      capabilities: ["physics.gravity", "physics.collision"],
      provides: [{ name: "physics.collision", family: "physics" }],
      requires: [],
    },
    family: "physics",
    role: "infrastructure",
  });

  // Add a primary content package matching the requested family
  decomposition.push({
    subSpec: {
      ...input.canonical,
      name: `${name}/primary`,
      role: "primary",
    },
    family,
    role: "primary",
  });

  // If the spec mentions weather or environment, add those
  if (capabilities.includes("weather.sky") || family === "weather") {
    decomposition.push({
      subSpec: {
        name: `${name}/weather`,
        family: "weather",
        displayName: `Weather for ${name}`,
        capabilities: ["weather.sky", "weather.clouds"],
        provides: [{ name: "weather.sky", family: "weather" }],
        requires: [],
      },
      family: "weather",
      role: "environment",
    });
  }

  return decomposition;
}

// Search the Registry for a package matching a sub-specification.
// Scores on: family match + capability overlap + theme compatibility.
export async function searchRegistry(
  subSpec: Record<string, unknown>,
  theme?: WorldTheme
): Promise<PackageRecord | null> {
  const family = (subSpec.family as string) ?? "building";
  const targetCapabilities = (subSpec.capabilities as string[]) ?? [];

  const candidates = await db.package.findMany({
    where: { family },
    include: { provides: true, requires: true },
  });

  if (candidates.length === 0) return null;

  let best: PackageRecord | null = null;
  let bestScore = -1;

  for (const c of candidates) {
    const pkg = mapPackage(c);
    const score = scoreCompatibility(pkg, targetCapabilities, theme);
    if (score > bestScore) {
      bestScore = score;
      best = pkg;
    }
  }

  // Require a minimum score to reuse (avoid bad matches)
  return bestScore >= 2 ? best : null;
}

// Score how well a package matches the desired capabilities + theme.
export function scoreCompatibility(
  pkg: PackageRecord,
  targetCapabilities: string[],
  theme?: WorldTheme
): number {
  let score = 0;

  // capability overlap
  const overlap = targetCapabilities.filter((c) => pkg.capabilities.includes(c)).length;
  score += overlap * 2;

  // family match bonus
  score += 1;

  // certification bonus
  const certBonus = { none: 0, basic: 1, verified: 2, certified: 3 }[pkg.certification.level] ?? 0;
  score += certBonus;

  // theme compatibility
  if (theme) {
    // if the world excludes this family, score 0
    if (theme.excludedFamilies?.includes(pkg.family)) return -100;
    // if the world prefers this family, bonus
    if (theme.preferredFamilies?.includes(pkg.family)) score += 2;
    // semantic: check if the package's specification mentions the world's art direction
    const specStr = JSON.stringify(pkg.specification).toLowerCase();
    if (theme.artDirection && specStr.includes(theme.artDirection.toLowerCase())) score += 3;
    if (theme.era && specStr.includes(theme.era.toLowerCase())) score += 2;
  }

  return score;
}

// Run the full reuse-first resolution.
export async function resolveReuseFirst(input: DecomposeInput): Promise<ReuseFirstResult> {
  const decomposition = decomposeSpecification(input);

  let theme: WorldTheme | undefined;
  if (input.worldProjectId) {
    const project = await db.worldProject.findUnique({ where: { id: input.worldProjectId } });
    if (project) theme = JSON.parse(project.theme) as WorldTheme;
  }

  const result: ReuseFirstResult = {
    decomposition: [],
    reusedCount: 0,
    generatedCount: 0,
    totalSubPackages: decomposition.length,
  };

  for (const sub of decomposition) {
    const reused = await searchRegistry(sub.subSpec, theme);
    if (reused) {
      result.decomposition.push({
        subSpec: sub.subSpec,
        family: sub.family,
        action: "reuse",
        reusedPackage: reused,
        reason: `Reused ${reused.name} (score ${scoreCompatibility(reused, (sub.subSpec.capabilities as string[]) ?? [], theme)})`,
      });
      result.reusedCount++;
    } else {
      result.decomposition.push({
        subSpec: sub.subSpec,
        family: sub.family,
        action: "generate",
        reason: `No suitable ${sub.family} package in the Registry — will generate`,
      });
      result.generatedCount++;
    }
  }

  return result;
}
