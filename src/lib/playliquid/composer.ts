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

  // Build a map of provided interface name → { package, version, minCompatible }
  const providedVersions = new Map<string, { provider: PackageRecord; version: string; minCompatible: string }>();
  for (const p of records) {
    for (const iface of p.provides) {
      // InterfaceContract carries version; minCompatible is in the schema field
      // (stored as JSON in the Interface model). For the in-memory record we
      // read it from the schema if present, else default to "0.0.0".
      const minCompat = (iface.schema as { minCompatible?: string })?.minCompatible ?? "0.0.0";
      providedVersions.set(iface.name, { provider: p, version: iface.version, minCompatible: minCompat });
    }
  }

  for (const consumer of records) {
    for (const req of consumer.requires) {
      const provided = providedVersions.get(req.name);
      if (provided) {
        // ── item 4: contract version compatibility check ──
        // The consumer requires version req.version; the provider offers
        // provided.version with minCompatible. They're compatible if
        // req.version >= provided.minCompatible AND req.version <= provided.version.
        if (!isVersionCompatible(req.version, provided.version, provided.minCompatible)) {
          unsatisfied.push(
            `${consumer.name} requires ${req.name}@${req.version} but ${provided.provider.name} provides ${req.name}@${provided.version} (minCompatible ${provided.minCompatible}) — version incompatible`
          );
          continue;
        }
        interfaceConnections.push({
          provider: provided.provider.name,
          consumer: consumer.name,
          contract: req.name,
        });
        resolvedDependencies.push({
          from: consumer.name,
          to: provided.provider.name,
          contract: req.name,
        });
      } else {
        unsatisfied.push(`${consumer.name} requires ${req.name}`);
      }
    }
  }

  // ── 2. Spatial graph: resolve packages to spatial slots (item 5) ──
  // Instead of family heuristics, we resolve each package to a named spatial
  // slot defined by the World Project. Packages whose family matches a slot's
  // acceptedFamilies are attached to that slot. This is the formal spatial
  // contract resolution.
  const slots = await db.spatialSlot.findMany({ where: { worldProjectId: project.id } });
  const slotMap = new Map<string, typeof slots>();
  for (const s of slots) {
    const fams = JSON.parse(s.acceptedFamilies) as string[];
    for (const f of fams) {
      if (!slotMap.has(f)) slotMap.set(f, []);
      slotMap.get(f)!.push(s);
    }
  }

  const spatialGraph: BuildManifest["spatialGraph"] = records.map((p, i) => {
    const anchor = defaultAnchor(p.family, i);
    // Find a slot that accepts this package's family
    const candidateSlots = slotMap.get(p.family) ?? [];
    const slot = candidateSlots[0]; // first match (future: capacity-aware assignment)
    return {
      entity: p.name,
      parent: slot?.name ?? (p.family === "building" || p.family === "vehicle" ? "region.root" : undefined),
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

  // ── 4b. Content-addressed manifest lock (item 9) ───────────────
  // The manifestLock pins exact package hashes + interface versions so a
  // build is reproducible byte-for-byte. This is the sole immutable
  // executable artifact — two builds with the same lock are identical.
  const manifestLock = {
    packages: records.map((p) => ({
      name: p.name,
      version: p.version,
      hash: p.hash,
      interfaces: {
        // Preserve the ACTUAL minCompatible from the interface schema,
        // not a hardcoded "0.0.0". This makes the lock reproducible.
        provides: p.provides.map((i) => ({
          name: i.name,
          version: i.version,
          minCompatible: (i.schema as { minCompatible?: string })?.minCompatible ?? "0.0.0",
        })),
        requires: p.requires.map((i) => ({ name: i.name, version: i.version })),
      },
    })),
    interfaceConnections: interfaceConnections.map((c) => `${c.provider}→${c.consumer}:${c.contract}`),
    lockHash: contentHash({ packages: records.map((p) => p.hash), connections: interfaceConnections }),
  };

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

  const hash = contentHash({ v: nextVersion, manifest, manifestLock, projectId: project.id });

  const build = await db.worldBuild.create({
    data: {
      version: nextVersion,
      worldProjectId: project.id,
      manifest: JSON.stringify(manifest),
      manifestLock: JSON.stringify(manifestLock),
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

// ── item 4: semver compatibility check ────────────────────────────
// A consumer requiring version R is compatible with a provider offering
// version P (minCompatible M) if: R >= M AND R <= P.
// Uses simple semver comparison (major.minor.patch).
function parseSemver(v: string): [number, number, number] {
  const parts = v.split(".").map((s) => parseInt(s, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
function compareSemver(a: string, b: string): number {
  const [aMaj, aMin, aPatch] = parseSemver(a);
  const [bMaj, bMin, bPatch] = parseSemver(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}
function isVersionCompatible(required: string, provided: string, minCompatible: string): boolean {
  // required must be >= minCompatible AND required <= provided
  return compareSemver(required, minCompatible) >= 0 && compareSemver(required, provided) <= 0;
}
