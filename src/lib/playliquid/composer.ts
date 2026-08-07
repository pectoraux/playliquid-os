// PRIMITIVE H — Composition Engine
// Turns a set of independent Packages into one coherent World:
// resolves dependencies, wires interface contracts, builds the spatial
// graph, applies capability policies, and freezes an immutable Build.

import { db } from "@/lib/db";
import { contentHash } from "./hashing";
import { mapPackage, mapWorldBuild } from "./mappers";
import type { BuildManifest, WorldTheme, InterfaceContract, PackageRecord } from "./types";

interface ComposeInput {
  worldProjectId: string;
  packageIds: string[];
}

export async function composeWorld(input: ComposeInput) {
  const project = await db.worldProject.findUnique({
    where: { id: input.worldProjectId },
  });
  if (!project) throw new Error("World Project not found");

  const theme = JSON.parse(project.theme) as WorldTheme;

  const packages = await db.package.findMany({
    where: { id: { in: input.packageIds } },
    include: { provides: true, requires: true },
  });

  if (packages.length === 0) throw new Error("No packages selected");

  const records = packages.map(mapPackage);

  // ── 1. Interface wiring: match every `requires` to a `provides` ─
  const providers = new Map<string, PackageRecord>();
  for (const p of records) {
    for (const iface of p.provides) {
      providers.set(iface.name, p);
    }
  }
  const interfaceConnections: BuildManifest["interfaceConnections"] = [];
  const resolvedDependencies: BuildManifest["resolvedDependencies"] = [];
  const unsatisfied: string[] = [];

  for (const consumer of records) {
    for (const req of consumer.requires) {
      const provider = providers.get(req.name);
      if (provider) {
        interfaceConnections.push({
          provider: provider.name,
          consumer: consumer.name,
          contract: req.name,
        });
        resolvedDependencies.push({
          from: consumer.name,
          to: provider.name,
          contract: req.name,
        });
      } else {
        unsatisfied.push(`${consumer.name} requires ${req.name}`);
      }
    }
  }

  // ── 2. Spatial graph: anchor each package by family heuristics ─
  const spatialGraph: BuildManifest["spatialGraph"] = records.map((p, i) => {
    const anchor = defaultAnchor(p.family, i);
    return {
      entity: p.name,
      parent: p.family === "building" || p.family === "vehicle" ? "region.root" : undefined,
      anchor,
    };
  });

  // ── 3. Capability policies (frozen rules of the world) ─────────
  const capabilityPolicies: Record<string, string> = {};
  for (const p of records) {
    for (const cap of p.capabilities) {
      capabilityPolicies[cap] = `granted:${p.name}`;
    }
  }

  // ── 4. Package version lock ────────────────────────────────────
  const packageVersions: Record<string, string> = {};
  for (const p of records) packageVersions[p.name] = p.version;

  // ── 5. Compose manifest ────────────────────────────────────────
  const manifest: BuildManifest = {
    specificationHash: contentHash(project.theme + project.rules),
    packageVersions,
    resolvedDependencies,
    interfaceConnections,
    spatialGraph,
    capabilityPolicies,
    runtimeConfig: { adapter: "simulator", theme: theme.artDirection },
    theme,
  };

  // ── 6. Determine next build version ────────────────────────────
  const lastBuild = await db.worldBuild.findFirst({
    where: { worldProjectId: project.id },
    orderBy: { version: "desc" },
  });
  const nextVersion = (lastBuild?.version ?? 0) + 1;

  const hash = contentHash({ v: nextVersion, manifest, projectId: project.id });

  const build = await db.worldBuild.create({
    data: {
      version: nextVersion,
      worldProjectId: project.id,
      manifest: JSON.stringify(manifest),
      hash,
      status: "composed",
      packages: {
        create: records.map((p) => ({ packageId: p.id })),
      },
    },
    include: {
      packages: { include: { package: { include: { provides: true, requires: true } } } },
      entities: true,
      nodes: true,
    },
  });

  return {
    build: mapWorldBuild(build),
    unsatisfied,
    manifest,
  };
}

function defaultAnchor(family: string, index: number): { x: number; y: number; z: number } {
  const stride = 12;
  const row = Math.floor(index / 5);
  const col = index % 5;
  const y = family === "building" ? 8 : family === "weather" ? 40 : 0;
  return { x: col * stride, y, z: row * stride };
}

// Expose the interface catalog for the UI.
export async function interfaceCatalog(): Promise<InterfaceContract[]> {
  const rows = await db.interface.findMany({
    where: { packageProvidedById: { not: null } },
  });
  return rows.map((i) => ({
    id: i.id,
    name: i.name,
    family: i.family,
    version: i.version,
    direction: i.direction as "provides" | "requires",
    schema: JSON.parse(i.schema) as Record<string, unknown>,
    description: i.description,
  }));
}
