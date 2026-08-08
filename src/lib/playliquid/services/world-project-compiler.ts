// ════════════════════════════════════════════════════════════════
// WORLD PROJECT COMPILER — Validation, Resolution, Compilation
// ════════════════════════════════════════════════════════════════
//
// The World Project Compiler is the orchestration layer that turns a
// World Project's accepted contributions into an immutable World Build.
//
// It NEVER generates content. Its job is:
//   1. Validate contributions (certification, anchor alignment)
//   2. Detect spatial conflicts (overlapping bounding volumes)
//   3. Resolve anchors (map each package's anchors to the project hierarchy)
//   4. Build the world graph (spatial relationships)
//   5. Build the navigation graph (walkability/connections)
//   6. Compile the runtime manifest (immutable World Build)
//
// This is "Git for Worlds": the World Project coordinates, packages
// implement, the compiler integrates.

import { db } from "@/lib/db";
import { contentHash } from "../hashing";

export interface AnchorPoint {
  name: string;
  position: { x: number; y: number; z: number };
  direction?: { x: number; y: number; z: number };
  type?: string; // "connection" | "attachment" | "navigation"
}

export interface BoundingVolume {
  minX: number; maxX: number;
  minY: number; maxY: number;
  minZ: number; maxZ: number;
}

export interface PackageSpatialContract {
  packageId: string;
  packageName: string;
  anchorPoints: AnchorPoint[];
  boundingVolume: BoundingVolume;
  connectionInterfaces: string[]; // e.g. ["road.connect", "navigation.walkable"]
  navigationInterfaces: string[]; // e.g. ["walkable", "drivable"]
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  packageCertified: boolean;
  anchorAligned: boolean;
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflicts: Array<{
    packageA: string;
    packageB: string;
    overlapVolume: number;
    description: string;
  }>;
}

export interface WorldGraphNode {
  entityId: string;
  packageName: string;
  position: { x: number; y: number; z: number };
  anchorId: string | null;
  connections: string[]; // connected entity IDs
}

export interface NavigationEdge {
  from: string;
  to: string;
  type: string; // "walkable" | "drivable" | "flyable"
  distance: number;
}

export interface CompiledWorldBuild {
  buildHash: string;
  entityCount: number;
  anchorCount: number;
  worldGraph: WorldGraphNode[];
  navigationGraph: NavigationEdge[];
  manifest: Record<string, unknown>;
  spatialContracts: PackageSpatialContract[];
  conflictsResolved: boolean;
}

// ── Extract spatial contract from a package's declarative artifact ──
export function extractSpatialContract(
  packageName: string,
  artifact: Record<string, unknown> | null,
  packageId: string
): PackageSpatialContract {
  if (!artifact) {
    return {
      packageId,
      packageName,
      anchorPoints: [],
      boundingVolume: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      connectionInterfaces: [],
      navigationInterfaces: [],
    };
  }

  const spatial = artifact.spatial as Record<string, unknown> | undefined;
  const anchorPoints = (spatial?.anchorPoints as AnchorPoint[]) ?? [];
  const bounds = spatial?.boundingVolume as BoundingVolume | undefined;
  const connections = (spatial?.connectionInterfaces as string[]) ?? [];
  const navigation = (spatial?.navigationInterfaces as string[]) ?? [];

  return {
    packageId,
    packageName,
    anchorPoints,
    boundingVolume: bounds ?? { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 },
    connectionInterfaces: connections,
    navigationInterfaces: navigation,
  };
}

// ── 1. Validate a contribution ──────────────────────────────────
export async function validateContribution(
  contributionId: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const contribution = await db.contribution.findUnique({
    where: { id: contributionId },
    include: {
      package: { include: { provides: true, requires: true } },
      worldProject: { include: { spatialSlots: true, spatialAnchors: true } },
    },
  });

  if (!contribution) {
    return { valid: false, errors: ["contribution not found"], warnings, packageCertified: false, anchorAligned: false };
  }

  // Check package exists + is certified
  let packageCertified = false;
  if (!contribution.package) {
    errors.push("contribution has no package");
  } else {
    const cert = JSON.parse(contribution.package.certification);
    packageCertified = cert.certificationLevel !== "none";
    if (!packageCertified) {
      errors.push(`package "${contribution.package.name}" is not certified (level: ${cert.certificationLevel})`);
    }
  }

  // Check target slot exists
  let anchorAligned = false;
  if (contribution.targetSlot) {
    const slot = contribution.worldProject.spatialSlots.find(
      (s) => s.name === contribution.targetSlot
    );
    if (!slot) {
      errors.push(`target slot "${contribution.targetSlot}" not found in world project`);
    } else {
      anchorAligned = true;
      // Check package family is accepted by slot
      if (contribution.package) {
        const acceptedFamilies = JSON.parse(slot.acceptedFamilies) as string[];
        if (acceptedFamilies.length > 0 && !acceptedFamilies.includes(contribution.package.family)) {
          errors.push(`package family "${contribution.package.family}" not accepted by slot "${slot.name}" (accepts: ${acceptedFamilies.join(", ")})`);
        }
      }
      // Check slot capacity
      if (slot.capacity !== null) {
        const mergedCount = await db.contribution.count({
          where: {
            worldProjectId: contribution.worldProjectId,
            targetSlot: contribution.targetSlot,
            status: "MERGED",
          },
        });
        if (mergedCount >= slot.capacity) {
          errors.push(`slot "${slot.name}" is at capacity (${slot.capacity})`);
        }
      }
    }
  } else {
    warnings.push("contribution has no target slot — will be placed at project origin");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    packageCertified,
    anchorAligned,
  };
}

// ── 2. Detect spatial conflicts between contributions ───────────
export function detectSpatialConflicts(
  contracts: PackageSpatialContract[]
): ConflictResult {
  const conflicts: ConflictResult["conflicts"] = [];

  for (let i = 0; i < contracts.length; i++) {
    for (let j = i + 1; j < contracts.length; j++) {
      const a = contracts[i];
      const b = contracts[j];
      const overlap = boxOverlap(a.boundingVolume, b.boundingVolume);
      if (overlap > 0) {
        conflicts.push({
          packageA: a.packageName,
          packageB: b.packageName,
          overlapVolume: overlap,
          description: `${a.packageName} and ${b.packageName} overlap by ${overlap.toFixed(2)} cubic units`,
        });
      }
    }
  }

  return { hasConflicts: conflicts.length > 0, conflicts };
}

function boxOverlap(a: BoundingVolume, b: BoundingVolume): number {
  const dx = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const dy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const dz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (dx > 0 && dy > 0 && dz > 0) return dx * dy * dz;
  return 0;
}

// ── 3. Resolve anchors (map package anchors to project hierarchy) ──
export async function resolveAnchors(
  worldProjectId: string,
  contracts: PackageSpatialContract[]
): Promise<Array<{ packageId: string; resolvedAnchors: Array<{ name: string; globalPosition: { x: number; y: number; z: number } }> }>> {
  const projectAnchors = await db.spatialAnchor.findMany({
    where: { worldProjectId },
  });

  const results: Array<{ packageId: string; resolvedAnchors: Array<{ name: string; globalPosition: { x: number; y: number; z: number } }> }> = [];

  for (const contract of contracts) {
    const resolved: Array<{ name: string; globalPosition: { x: number; y: number; z: number } }> = [];
    for (const ap of contract.anchorPoints) {
      // Try to find a matching project anchor by semantic proximity
      // In a full system this would use the anchor hierarchy
      const match = projectAnchors.find((pa) =>
        Math.abs(pa.globalX - ap.position.x) < 5 &&
        Math.abs(pa.globalZ - ap.position.z) < 5
      );
      resolved.push({
        name: ap.name,
        globalPosition: match
          ? { x: match.globalX, y: match.globalY, z: match.globalZ }
          : ap.position,
      });
    }
    results.push({ packageId: contract.packageId, resolvedAnchors: resolved });
  }

  return results;
}

// ── 4. Build the world graph (spatial relationships) ────────────
export function buildWorldGraph(
  contracts: PackageSpatialContract[],
  resolvedAnchors: Array<{ packageId: string; resolvedAnchors: Array<{ name: string; globalPosition: { x: number; y: number; z: number } }> }>
): WorldGraphNode[] {
  const nodes: WorldGraphNode[] = contracts.map((c) => {
    const resolved = resolvedAnchors.find((r) => r.packageId === c.packageId);
    const primaryAnchor = resolved?.resolvedAnchors[0];
    return {
      entityId: c.packageId,
      packageName: c.packageName,
      position: primaryAnchor?.globalPosition ?? { x: 0, y: 0, z: 0 },
      anchorId: primaryAnchor?.name ?? null,
      connections: [],
    };
  });

  // Connect nodes that share connection interfaces and are within proximity
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = contracts[i];
      const b = contracts[j];
      const sharedInterfaces = a.connectionInterfaces.filter((ci) => b.connectionInterfaces.includes(ci));
      if (sharedInterfaces.length > 0) {
        nodes[i].connections.push(nodes[j].entityId);
        nodes[j].connections.push(nodes[i].entityId);
      }
    }
  }

  return nodes;
}

// ── 5. Build the navigation graph (walkability/connections) ─────
export function buildNavigationGraph(
  worldGraph: WorldGraphNode[],
  contracts: PackageSpatialContract[]
): NavigationEdge[] {
  const edges: NavigationEdge[] = [];
  for (const node of worldGraph) {
    for (const connectedId of node.connections) {
      const other = worldGraph.find((n) => n.entityId === connectedId);
      if (!other) continue;
      const contract = contracts.find((c) => c.packageId === node.entityId);
      const navType = contract?.navigationInterfaces[0] ?? "walkable";
      const dx = node.position.x - other.position.x;
      const dy = node.position.y - other.position.y;
      const dz = node.position.z - other.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      edges.push({ from: node.entityId, to: connectedId, type: navType, distance });
    }
  }
  return edges;
}

// ── 6. Compile the World Build (immutable manifest) ─────────────
export async function compileWorldBuild(
  worldProjectId: string,
  branchName: string = "main"
): Promise<CompiledWorldBuild> {
  // Get all MERGED contributions for this project
  const contributions = await db.contribution.findMany({
    where: { worldProjectId, status: "MERGED" },
    include: { package: true },
  });

  // Extract spatial contracts from each package's artifact
  const contracts: PackageSpatialContract[] = [];
  for (const c of contributions) {
    if (!c.package) continue;
    const manifest = JSON.parse(c.package.manifest);
    const artifact = manifest?.artifact ?? null;
    const spatial = extractSpatialContract(c.package.name, artifact, c.package.id);
    contracts.push(spatial);
  }

  // Detect conflicts
  const conflictResult = detectSpatialConflicts(contracts);
  if (conflictResult.hasConflicts) {
    // In a real system, conflicts would block compilation
    // Here we log them but continue (the build is marked with conflictsResolved)
  }

  // Resolve anchors
  const resolvedAnchors = await resolveAnchors(worldProjectId, contracts);

  // Build graphs
  const worldGraph = buildWorldGraph(contracts, resolvedAnchors);
  const navigationGraph = buildNavigationGraph(worldGraph, contracts);

  // Get the project's anchors
  const anchorCount = await db.spatialAnchor.count({ where: { worldProjectId } });

  // Compile the manifest
  const manifest = {
    worldProjectId,
    branchName,
    contributions: contributions.map((c) => ({
      packageId: c.packageId,
      packageName: c.package?.name,
      targetSlot: c.targetSlot,
    })),
    spatialContracts: contracts.map((c) => ({
      package: c.packageName,
      anchorPoints: c.anchorPoints.length,
      boundingVolume: c.boundingVolume,
      connections: c.connectionInterfaces,
      navigation: c.navigationInterfaces,
    })),
    worldGraph: worldGraph.length,
    navigationGraph: navigationGraph.length,
    conflicts: conflictResult.conflicts.length,
    compiledAt: new Date().toISOString(),
  };

  const buildHash = contentHash(manifest);

  return {
    buildHash,
    entityCount: contracts.length,
    anchorCount,
    worldGraph,
    navigationGraph,
    manifest,
    spatialContracts: contracts,
    conflictsResolved: !conflictResult.hasConflicts,
  };
}
