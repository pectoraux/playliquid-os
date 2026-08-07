// PRIMITIVE E — Package Resolver
// Decides, for a given Specification, whether to reuse an existing Package,
// reuse/fork a compatible one, or generate a new one.
//
//   exact match      → reuse
//   compatible match → reuse/fork
//   no match         → LLM generation (handled by the generation pipeline)
//
// World coherence: candidates are filtered against the World Project's theme
// (allowed/preferred/excluded families + art direction) so the resolver asks
// "does this Package technically AND semantically fit this World?".

import { db } from "@/lib/db";
import { mapPackage } from "./mappers";
import type { PackageRecord, ResolveResult, ReusePolicy, WorldTheme } from "./types";

interface ResolveInput {
  specificationId: string;
  worldProjectId?: string;
  reusePolicy: ReusePolicy;
}

export async function resolvePackages(input: ResolveInput): Promise<ResolveResult> {
  const spec = await db.specification.findUnique({
    where: { id: input.specificationId },
  });
  if (!spec) throw new Error("Specification not found");

  const canonical = JSON.parse(spec.canonical) as Record<string, unknown>;
  const targetFamily = (canonical.family as string) || (canonical.kind as string) || "building";
  const targetName = (canonical.name as string) || (canonical.displayName as string);

  let theme: WorldTheme | undefined;
  if (input.worldProjectId) {
    const project = await db.worldProject.findUnique({ where: { id: input.worldProjectId } });
    if (project) theme = JSON.parse(project.theme) as WorldTheme;
  }

  const candidates = await db.package.findMany({
    where: { family: targetFamily },
    include: { provides: true, requires: true },
  });

  // ── Coherence filter: respects the World's theme ───────────────
  const coherent = theme
    ? candidates.filter((p) => {
        if (theme.excludedFamilies?.includes(p.family)) return false;
        if (
          theme.allowedFamilies?.length &&
          !theme.allowedFamilies.includes(p.family)
        )
          return false;
        return true;
      })
    : candidates;

  // ── Reuse policy gate ──────────────────────────────────────────
  if (input.reusePolicy === "reuse-none") {
    return { reused: [], generated: [], missing: [specToMissing(spec, canonical)] } as ResolveResult;
  }

  if (
    input.reusePolicy === "reuse-infrastructure-only" &&
    !isInfrastructure(targetFamily)
  ) {
    return { reused: [], generated: [], missing: [specToMissing(spec, canonical)] } as ResolveResult;
  }

  // ── Exact match by name ────────────────────────────────────────
  const exact = coherent.find((p) => p.name === targetName);
  if (exact) {
    return {
      reused: [mapPackage(exact)],
      generated: [],
      missing: [],
    };
  }

  // ── Compatible match: same family + overlapping capabilities ────
  const targetCapabilities = Array.isArray(canonical.capabilities)
    ? (canonical.capabilities as string[])
    : [];
  const compatible = coherent.filter((p) => {
    const caps = JSON.parse(p.capabilities) as string[];
    if (targetCapabilities.length === 0) return true;
    return targetCapabilities.some((c) => caps.includes(c));
  });

  if (compatible.length > 0) {
    // pick the most-certified compatible package
    const ranked = [...compatible].sort((a, b) => {
      const ca = JSON.parse(a.certification) as { level: string };
      const cb = JSON.parse(b.certification) as { level: string };
      return levelRank(cb.level) - levelRank(ca.level);
    });
    return {
      reused: ranked.slice(0, 3).map(mapPackage),
      generated: [],
      missing: [],
    };
  }

  // ── No suitable package → must be generated ────────────────────
  return {
    reused: [],
    generated: [],
    missing: [specToMissing(spec, canonical)],
  };
}

function isInfrastructure(family: string): boolean {
  return ["road", "physics", "renderer", "infrastructure", "input"].includes(family);
}

function levelRank(level: string): number {
  return { none: 0, basic: 1, verified: 2, certified: 3 }[level] ?? 0;
}

function specToMissing(
  spec: { id: string; naturalLanguage: string | null; canonical: string; kind: string; createdAt: Date },
  canonical: Record<string, unknown>
) {
  return {
    id: spec.id,
    naturalLanguage: spec.naturalLanguage,
    canonical,
    kind: spec.kind as "package" | "world" | "entity",
    theme: null,
    spatialRules: null,
    policies: null,
    createdAt: spec.createdAt.toISOString(),
  };
}

// Helper for the generate pipeline: find packages available for a world
// (used by the prompt compiler to build neighbor / dependency context).
export async function contextForWorld(worldProjectId?: string): Promise<PackageRecord[]> {
  if (!worldProjectId) return [];
  const project = await db.worldProject.findUnique({
    where: { id: worldProjectId },
  });
  if (!project) return [];
  const manifest = JSON.parse(project.packageManifest) as string[];
  if (!manifest.length) return [];
  const pkgs = await db.package.findMany({
    where: { name: { in: manifest } },
    include: { provides: true, requires: true },
  });
  return pkgs.map(mapPackage);
}
