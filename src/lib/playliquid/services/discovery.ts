// ════════════════════════════════════════════════════════════════
// DISCOVERY SERVICE — World Discovery
// ════════════════════════════════════════════════════════════════
//
// Phase M: Real discovery. Worlds are listable, searchable, addressable.
// Federation-ready contract: a remote node could implement the same
// query interface and merge results.
//
// Contracts fulfilled:
//   - discovery.worlds: list, search, filter by theme/status/builds

import { db } from "@/lib/db";

export interface DiscoverableWorld {
  id: string;
  name: string;
  slug: string;
  description: string;
  theme: Record<string, unknown>;
  buildCount: number;
  latestBuildVersion: number | null;
  latestBuildHash: string | null;
  contributorCount: number;
  hasRunningNode: boolean;
}

export interface DiscoveryQuery {
  search?: string;
  theme?: string;
  hasRunningNode?: boolean;
  limit?: number;
  offset?: number;
}

// ── List/search worlds ──────────────────────────────────────────
export async function discoverWorlds(query: DiscoveryQuery = {}): Promise<{
  worlds: DiscoverableWorld[];
  total: number;
}> {
  const { search, limit = 50, offset = 0 } = query;

  const where = search
    ? {
        OR: [
          { name: { contains: search } },
          { description: { contains: search } },
          { slug: { contains: search } },
        ],
      }
    : {};

  const [projects, total] = await Promise.all([
    db.worldProject.findMany({
      where,
      include: {
        builds: {
          orderBy: { version: "desc" },
          take: 1,
          include: { nodes: { where: { status: "running" }, select: { id: true } } },
        },
        _count: { select: { contributions: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    }),
    db.worldProject.count({ where }),
  ]);

  const worlds: DiscoverableWorld[] = projects.map((p) => {
    const theme = (() => { try { return JSON.parse(p.theme); } catch { return {}; } })();
    const latestBuild = p.builds[0];
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      theme,
      buildCount: p.builds.length,
      latestBuildVersion: latestBuild?.version ?? null,
      latestBuildHash: latestBuild?.hash ?? null,
      contributorCount: p._count.contributions,
      hasRunningNode: (latestBuild?.nodes?.length ?? 0) > 0,
    };
  });

  // Filter by hasRunningNode if requested
  const filtered = query.hasRunningNode !== undefined
    ? worlds.filter((w) => w.hasRunningNode === query.hasRunningNode)
    : worlds;

  return { worlds: filtered, total: query.hasRunningNode !== undefined ? filtered.length : total };
}

// ── Get a single world's discovery info ─────────────────────────
export async function getWorldInfo(worldProjectId: string): Promise<DiscoverableWorld | null> {
  const p = await db.worldProject.findUnique({
    where: { id: worldProjectId },
    include: {
      builds: {
        orderBy: { version: "desc" },
        take: 1,
        include: { nodes: { where: { status: "running" }, select: { id: true } } },
      },
      _count: { select: { contributions: true } },
    },
  });
  if (!p) return null;
  const theme = (() => { try { return JSON.parse(p.theme); } catch { return {}; } })();
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    theme,
    buildCount: p.builds.length,
    latestBuildVersion: p.builds[0]?.version ?? null,
    latestBuildHash: p.builds[0]?.hash ?? null,
    contributorCount: p._count.contributions,
    hasRunningNode: (p.builds[0]?.nodes?.length ?? 0) > 0,
  };
}

// ── Federation contract (for future remote nodes) ───────────────
// A remote discovery node would implement this same interface:
//   GET /api/services/discovery/worlds?search=...&limit=...
//   GET /api/services/discovery/worlds/:id
// The local discovery service could merge local + remote results.
export interface FederationNode {
  nodeId: string;
  endpoint: string;
  trust: "full" | "partial" | "none";
}

const federationNodes: FederationNode[] = [];

export function registerFederationNode(node: FederationNode): void {
  federationNodes.push(node);
}

export function listFederationNodes(): FederationNode[] {
  return [...federationNodes];
}
