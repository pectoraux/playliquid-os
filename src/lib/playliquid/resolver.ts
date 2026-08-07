// Package resolution helpers.
//
// The primary reuse-first resolution now lives in reuse-engine.ts, which
// implements the 5 reuse policies (reuse-freely, prefer-existing,
// approve-only, generate-replacements, never-reuse) with theme/style/era
// scoring. This module retains the context-building helper used by the
// prompt compiler to construct neighbor/dependency context for a world.

import { db } from "@/lib/db";
import { mapPackage } from "./mappers";
import type { PackageRecord } from "./types";

// Find packages available for a world (used by the prompt compiler to
// build neighbor / dependency context).
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
