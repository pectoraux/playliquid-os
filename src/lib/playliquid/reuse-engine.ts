// PRIMITIVE #1 (Registry) — Reuse-first generation with theme/style constraints
//
//   User request
//       ↓
//   World Specification
//       ↓
//   Package Decomposition  (break into sub-packages)
//       ↓
//   Registry Search  (per sub-package, with theme/style/era/realism scoring)
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
// Reuse policies (creator control — reuse without homogenization):
//   reuse-freely          — reuse anything compatible
//   prefer-existing       — reuse if score >= threshold, else generate
//   approve-only          — reuse only packages on the world's approved list
//   generate-replacements — generate fresh even if compatible exists
//   never-reuse           — never reuse (for the specified families)

import { db } from "@/lib/db";
import { mapPackage } from "./mappers";
import type {
  PackageRecord,
  ReuseFirstResult,
  ReusePolicy,
  ReuseScoreBreakdown,
  WorldTheme,
} from "./types";

interface DecomposeInput {
  naturalLanguage: string;
  canonical: Record<string, unknown>;
  worldProjectId?: string;
}

interface ResolveInput extends DecomposeInput {
  policy: ReusePolicy;
  neverReuseFamilies?: string[]; // families to never reuse (for "never-reuse")
  approvedPackageNames?: string[]; // for "approve-only"
}

// Decompose a top-level specification into sub-package specifications.
export function decomposeSpecification(input: DecomposeInput): Array<{
  subSpec: Record<string, unknown>;
  family: string;
  role: string;
}> {
  const family = (input.canonical.family as string) ?? "building";
  const capabilities = (input.canonical.capabilities as string[]) ?? [];
  const name = (input.canonical.name as string) ?? input.naturalLanguage.slice(0, 40);

  const atomicFamilies = ["building", "road", "avatar", "vehicle", "creature", "weather", "physics", "sensory"];
  if (atomicFamilies.includes(family)) {
    return [{ subSpec: input.canonical, family, role: "primary" }];
  }

  const decomposition: Array<{ subSpec: Record<string, unknown>; family: string; role: string }> = [];

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

  decomposition.push({
    subSpec: {
      ...input.canonical,
      name: `${name}/primary`,
      role: "primary",
    },
    family,
    role: "primary",
  });

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

// Score how well a package matches the desired capabilities + theme + style + era.
// Returns a full breakdown so the UI can show WHY a package was chosen/rejected.
export function scoreCompatibilityDetailed(
  pkg: PackageRecord,
  targetCapabilities: string[],
  theme?: WorldTheme
): ReuseScoreBreakdown {
  const breakdown: ReuseScoreBreakdown = {
    total: 0,
    capabilityOverlap: 0,
    familyMatch: 1, // family already matched by the query
    certification: 0,
    themeCompatibility: 0,
    styleCompatibility: 0,
    eraCompatibility: 0,
    excluded: false,
  };

  // capability overlap
  const overlap = targetCapabilities.filter((c) => pkg.capabilities.includes(c)).length;
  breakdown.capabilityOverlap = overlap * 2;

  // certification
  breakdown.certification = { none: 0, basic: 1, verified: 2, certified: 3 }[pkg.certification.level] ?? 0;

  if (theme) {
    // excluded family → hard reject
    if (theme.excludedFamilies?.includes(pkg.family)) {
      breakdown.excluded = true;
      breakdown.total = -1000;
      return breakdown;
    }
    if (theme.preferredFamilies?.includes(pkg.family)) breakdown.themeCompatibility += 2;

    const specStr = JSON.stringify(pkg.specification).toLowerCase();
    // art direction / style
    if (theme.artDirection && specStr.includes(theme.artDirection.toLowerCase())) {
      breakdown.styleCompatibility += 3;
    }
    if (theme.materialLanguage && specStr.includes(theme.materialLanguage.toLowerCase())) {
      breakdown.styleCompatibility += 2;
    }
    // era
    if (theme.era && specStr.includes(theme.era.toLowerCase())) {
      breakdown.eraCompatibility += 3;
    }
    // technology level
    if (theme.technologyLevel && specStr.includes(theme.technologyLevel.toLowerCase())) {
      breakdown.eraCompatibility += 1;
    }
  }

  breakdown.total =
    breakdown.capabilityOverlap +
    breakdown.familyMatch +
    breakdown.certification +
    breakdown.themeCompatibility +
    breakdown.styleCompatibility +
    breakdown.eraCompatibility;

  return breakdown;
}

// Backwards-compatible scalar score.
export function scoreCompatibility(
  pkg: PackageRecord,
  targetCapabilities: string[],
  theme?: WorldTheme
): number {
  return scoreCompatibilityDetailed(pkg, targetCapabilities, theme).total;
}

// Search the Registry for the best matching package, respecting the reuse policy.
export async function searchRegistry(
  subSpec: Record<string, unknown>,
  theme: WorldTheme | undefined,
  policy: ReusePolicy,
  neverReuseFamilies: string[],
  approvedPackageNames: string[]
): Promise<{ pkg: PackageRecord | null; score: ReuseScoreBreakdown | null }> {
  const family = (subSpec.family as string) ?? "building";
  const targetCapabilities = (subSpec.capabilities as string[]) ?? [];

  // Policy gate: never-reuse for this family
  if (policy === "never-reuse" && neverReuseFamilies.includes(family)) {
    return { pkg: null, score: null };
  }
  // Policy gate: generate-replacements → always generate
  if (policy === "generate-replacements") {
    return { pkg: null, score: null };
  }

  const candidates = await db.package.findMany({
    where: { family },
    include: { provides: true, requires: true },
  });

  if (candidates.length === 0) return { pkg: null, score: null };

  let best: PackageRecord | null = null;
  let bestScore: ReuseScoreBreakdown | null = null;

  for (const c of candidates) {
    const pkg = mapPackage(c);
    const score = scoreCompatibilityDetailed(pkg, targetCapabilities, theme);
    if (score.excluded) continue; // theme excludes this family

    // Policy gate: approve-only → must be on the approved list
    if (policy === "approve-only" && !approvedPackageNames.includes(pkg.name)) {
      continue;
    }

    if (!bestScore || score.total > bestScore.total) {
      bestScore = score;
      best = pkg;
    }
  }

  if (!best || !bestScore) return { pkg: null, score: null };

  // Policy gate: prefer-existing → require a minimum score
  const threshold = policy === "prefer-existing" ? 4 : 2;
  if (bestScore.total < threshold) {
    return { pkg: null, score: bestScore };
  }

  return { pkg: best, score: bestScore };
}

// Run the full reuse-first resolution with a reuse policy.
export async function resolveReuseFirst(input: ResolveInput): Promise<ReuseFirstResult> {
  const decomposition = decomposeSpecification(input);

  let theme: WorldTheme | undefined;
  let approvedPackageNames: string[] = [];
  if (input.worldProjectId) {
    const project = await db.worldProject.findUnique({ where: { id: input.worldProjectId } });
    if (project) {
      theme = JSON.parse(project.theme) as WorldTheme;
      approvedPackageNames = JSON.parse(project.packageManifest) as string[];
    }
  }

  const neverReuseFamilies = input.neverReuseFamilies ?? [];

  const result: ReuseFirstResult = {
    decomposition: [],
    reusedCount: 0,
    generatedCount: 0,
    totalSubPackages: decomposition.length,
    policy: input.policy,
  };

  for (const sub of decomposition) {
    const { pkg: reused, score } = await searchRegistry(
      sub.subSpec,
      theme,
      input.policy,
      neverReuseFamilies,
      approvedPackageNames
    );
    if (reused && score) {
      result.decomposition.push({
        subSpec: sub.subSpec,
        family: sub.family,
        action: "reuse",
        reusedPackage: reused,
        score,
        reason: `Reused ${reused.name} — score ${score.total} (caps ${score.capabilityOverlap}, style ${score.styleCompatibility}, era ${score.eraCompatibility})`,
      });
      result.reusedCount++;
    } else {
      result.decomposition.push({
        subSpec: sub.subSpec,
        family: sub.family,
        action: "generate",
        score: score ?? undefined,
        reason: score
          ? `Best candidate scored ${score.total} — below threshold for policy "${input.policy}"`
          : `Policy "${input.policy}" blocks reuse for family ${sub.family}`,
      });
      result.generatedCount++;
    }
  }

  return result;
}
