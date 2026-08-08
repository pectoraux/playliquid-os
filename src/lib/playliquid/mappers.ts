// Mappers: Prisma row → canonical Playliquid record.
// All JSON-string columns are parsed here so the rest of the codebase
// works with typed objects.

import type { Prisma } from "@prisma/client";
import type {
  PackageRecord,
  SpecificationRecord,
  WorldProjectRecord,
  WorldBuildRecord,
  EntityRecord,
  WorldNodeRecord,
  KernelEventRecord,
  GenerationRequestRecord,
  WorldTheme,
  InterfaceContract,
  BuildManifest,
} from "./types";

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

type PackageWithRelations = Prisma.PackageGetPayload<{
  include: { provides: true; requires: true };
}>;

export function mapPackage(p: PackageWithRelations): PackageRecord {
  return {
    id: p.id,
    name: p.name,
    displayName: p.displayName,
    description: p.description,
    family: p.family as PackageRecord["family"],
    version: p.version,
    hash: p.hash,
    manifest: safeParse(p.manifest, {}),
    specification: safeParse(p.specification, {}),
    artifactUri: p.artifactUri,
    provenance: safeParse(p.provenance, { generator: "import", checks: [] }),
    certification: safeParse(p.certification, { signed: false, level: "none", checks: [] }),
    license: p.license,
    capabilities: safeParse<string[]>(p.capabilities, []),
    provides: (p.provides ?? []).map(mapInterface),
    requires: (p.requires ?? []).map(mapInterface),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

function mapInterface(i: {
  id: string;
  name: string;
  family: string;
  version: string;
  direction: string;
  schema: string;
  description: string;
}): InterfaceContract {
  return {
    id: i.id,
    name: i.name,
    family: i.family,
    version: i.version,
    direction: i.direction as "provides" | "requires",
    schema: safeParse(i.schema, {}),
    description: i.description,
  };
}

export function mapSpecification(s: {
  id: string;
  naturalLanguage: string | null;
  canonical: string;
  kind: string;
  theme: string | null;
  spatialRules: string | null;
  policies: string | null;
  createdAt: Date;
}): SpecificationRecord {
  return {
    id: s.id,
    naturalLanguage: s.naturalLanguage,
    canonical: safeParse(s.canonical, {}),
    kind: s.kind as SpecificationRecord["kind"],
    theme: safeParse(s.theme, null),
    spatialRules: safeParse(s.spatialRules, null),
    policies: safeParse(s.policies, null),
    createdAt: s.createdAt.toISOString(),
  };
}

export function mapEntity(
  e: {
    id: string;
    worldBuildId: string;
    packageId: string;
    name: string;
    position: string;
    components: string;
    state: string;
    createdAt: Date;
    package?: PackageWithRelations | null;
  }
): EntityRecord {
  return {
    id: e.id,
    worldBuildId: e.worldBuildId,
    packageId: e.packageId,
    package: e.package ? mapPackage(e.package) : undefined,
    name: e.name,
    position: safeParse(e.position, { x: 0, y: 0, z: 0 }),
    components: safeParse<string[]>(e.components, []),
    state: safeParse(e.state, {}),
    createdAt: e.createdAt.toISOString(),
  };
}

export function mapWorldNode(n: {
  id: string;
  worldBuildId: string;
  host: string;
  endpoint: string;
  status: string;
  health: string;
  capabilities: string;
  startedAt: Date | null;
  createdAt: Date;
}): WorldNodeRecord {
  return {
    id: n.id,
    worldBuildId: n.worldBuildId,
    host: n.host as WorldNodeRecord["host"],
    endpoint: n.endpoint,
    status: n.status as WorldNodeRecord["status"],
    health: safeParse(n.health, {}),
    capabilities: safeParse(n.capabilities, {}),
    startedAt: n.startedAt ? n.startedAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

export function mapWorldBuild(b: {
  id: string;
  version: number;
  worldProjectId: string;
  manifest: string;
  hash: string;
  status: string;
  createdAt: Date;
  packages?: Array<{ package: PackageWithRelations }>;
  entities?: Array<Parameters<typeof mapEntity>[0]>;
  nodes?: Array<Parameters<typeof mapWorldNode>[0]>;
}): WorldBuildRecord {
  return {
    id: b.id,
    version: b.version,
    worldProjectId: b.worldProjectId,
    manifest: safeParse<BuildManifest>(b.manifest, {
      specificationHash: b.hash,
      packageVersions: {},
      resolvedDependencies: [],
      interfaceConnections: [],
      spatialGraph: [],
      capabilityPolicies: {},
      runtimeConfig: {},
      theme: {} as WorldTheme,
    }),
    hash: b.hash,
    status: b.status as WorldBuildRecord["status"],
    packages: (b.packages ?? []).map((bp) => mapPackage(bp.package)),
    entities: (b.entities ?? []).map(mapEntity),
    nodes: (b.nodes ?? []).map(mapWorldNode),
    createdAt: b.createdAt.toISOString(),
  };
}

export function mapWorldProject(
  w: {
    id: string;
    name: string;
    slug: string;
    description: string;
    theme: string;
    rules: string;
    packageManifest: string;
    contributors: string;
    specificationId: string | null;
    createdAt: Date;
    updatedAt: Date;
    specification?: Parameters<typeof mapSpecification>[0] | null;
    builds?: Array<Parameters<typeof mapWorldBuild>[0]>;
  }
): WorldProjectRecord {
  return {
    id: w.id,
    name: w.name,
    slug: w.slug,
    description: w.description,
    theme: safeParse<WorldTheme>(w.theme, {} as WorldTheme),
    rules: safeParse(w.rules, {}),
    packageManifest: safeParse<string[]>(w.packageManifest, []),
    contributors: safeParse<string[]>(w.contributors, []),
    specification: w.specification ? mapSpecification(w.specification) : null,
    builds: (w.builds ?? []).map(mapWorldBuild),
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
  };
}

export function mapKernelEvent(e: {
  id: string;
  entityId: string | null;
  type: string;
  payload: string;
  createdAt: Date;
}): KernelEventRecord {
  return {
    id: e.id,
    entityId: e.entityId,
    type: e.type,
    payload: safeParse(e.payload, {}),
    createdAt: e.createdAt.toISOString(),
  };
}

export function mapGenerationRequest(g: {
  id: string;
  input: string;
  specification: string;
  prompt: string;
  provider: string;
  status: string;
  packageId: string | null;
  log: string;
  createdAt: Date;
}): GenerationRequestRecord {
  return {
    id: g.id,
    input: g.input,
    specification: safeParse(g.specification, {}),
    prompt: g.prompt,
    provider: g.provider,
    status: g.status,
    packageId: g.packageId,
    log: safeParse(g.log, []),
    createdAt: g.createdAt.toISOString(),
  };
}

// ── World Service mappers ─────────────────────────────────────────
import type {
  WorldServiceRecord,
  WorldServiceBindingRecord,
  CapabilityPolicyRecord,
  SpatialSlotRecord,
  ContributionRecord,
} from "./types";

export function mapWorldService(s: {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: string;
  contract: string;
  provider: string;
  status: string;
  implementationStatus: string;
  implementationNote: string;
  config: string;
  createdAt: Date;
  updatedAt: Date;
}): WorldServiceRecord {
  return {
    id: s.id,
    name: s.name,
    displayName: s.displayName,
    description: s.description,
    category: s.category,
    contract: safeParse(s.contract, {}),
    provider: s.provider,
    status: s.status,
    implementationStatus: s.implementationStatus,
    implementationNote: s.implementationNote,
    config: safeParse(s.config, {}),
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

export function mapWorldServiceBinding(b: {
  id: string;
  worldProjectId: string;
  worldServiceId: string;
  worldService?: Parameters<typeof mapWorldService>[0] | null;
  enabled: boolean;
  config: string;
  createdAt: Date;
}): WorldServiceBindingRecord {
  return {
    id: b.id,
    worldProjectId: b.worldProjectId,
    worldServiceId: b.worldServiceId,
    worldService: b.worldService ? mapWorldService(b.worldService) : undefined,
    enabled: b.enabled,
    config: safeParse(b.config, {}),
    createdAt: b.createdAt.toISOString(),
  };
}

export function mapCapabilityPolicy(p: {
  id: string;
  worldProjectId: string;
  layer: string;
  zoneName: string | null;
  experienceName: string | null;
  capability: string;
  rules: string;
  priority: number;
  createdAt: Date;
}): CapabilityPolicyRecord {
  return {
    id: p.id,
    worldProjectId: p.worldProjectId,
    layer: p.layer as CapabilityPolicyRecord["layer"],
    zoneName: p.zoneName,
    experienceName: p.experienceName,
    capability: p.capability,
    rules: safeParse(p.rules, []),
    priority: p.priority,
    createdAt: p.createdAt.toISOString(),
  };
}

export function mapSpatialSlot(s: {
  id: string;
  worldProjectId: string;
  name: string;
  displayName: string;
  slotType: string;
  bounds: string;
  acceptedFamilies: string;
  capacity: number | null;
  createdAt: Date;
}): SpatialSlotRecord {
  return {
    id: s.id,
    worldProjectId: s.worldProjectId,
    name: s.name,
    displayName: s.displayName,
    slotType: s.slotType,
    bounds: safeParse(s.bounds, { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0 }),
    acceptedFamilies: safeParse(s.acceptedFamilies, []),
    capacity: s.capacity,
    createdAt: s.createdAt.toISOString(),
  };
}

export function mapContribution(c: {
  id: string;
  worldProjectId: string;
  packageId: string | null;
  package?: Parameters<typeof mapPackage>[0] | null;
  contributorName: string;
  title: string;
  description: string;
  targetSlot: string | null;
  status: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}): ContributionRecord {
  return {
    id: c.id,
    worldProjectId: c.worldProjectId,
    packageId: c.packageId,
    package: c.package ? mapPackage(c.package) : undefined,
    contributorName: c.contributorName,
    title: c.title,
    description: c.description,
    targetSlot: c.targetSlot,
    status: c.status as ContributionRecord["status"],
    reviewNote: c.reviewNote,
    reviewedBy: c.reviewedBy,
    reviewedAt: c.reviewedAt ? c.reviewedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}
