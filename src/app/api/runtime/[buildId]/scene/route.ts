import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/runtime/:buildId/scene
// Returns the canonical, engine-independent scene graph for a World Build.
// This is the PlayLiquid Protocol payload — any runtime adapter (browser,
// Unity, Unreal) consumes this same data and renders it in its own way.
//
// The scene graph contains:
//   - world identity
//   - spatial anchors (the cross-engine spatial protocol)
//   - entities (PlayLiquid-native identity + position + state)
//   - capability policies (the Kernel's effective rules)
//   - runtime config (which adapter, theme)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;

  const build = await db.worldBuild.findUnique({
    where: { id: buildId },
    include: {
      worldProject: true,
      packages: { include: { package: { include: { provides: true, requires: true, runtimeArtifacts: true } } } },
      entities: { include: { package: { include: { provides: true, requires: true, runtimeArtifacts: true } } } },
      nodes: true,
    },
  });

  if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });

  // Load spatial anchors for this world
  const anchors = await db.spatialAnchor.findMany({
    where: { worldProjectId: build.worldProjectId },
    orderBy: { semanticId: "asc" },
  });

  // Load capability policies
  const policies = await db.capabilityPolicy.findMany({
    where: { worldProjectId: build.worldProjectId },
    orderBy: { priority: "asc" },
  });

  const manifest = JSON.parse(build.manifest);
  const theme = JSON.parse(build.worldProject.theme);

  // Build the canonical scene graph — engine-independent
  const scene = {
    // ── World Identity (protocol.world) ──
    world: {
      id: build.worldProject.id,
      name: build.worldProject.name,
      slug: build.worldProject.slug,
      buildVersion: build.version,
      buildHash: build.hash,
      theme,
    },
    // ── Spatial Anchors (protocol.spatial.anchor) ──
    anchors: anchors.map((a) => ({
      id: a.id,
      semanticId: a.semanticId,
      displayName: a.displayName,
      parent: a.parentAnchorId,
      type: a.anchorType,
      semantic: a.semantic,
      coordinateSystem: a.coordinateSystem,
      global: { x: a.globalX, y: a.globalY, z: a.globalZ },
      local: { x: a.localX, y: a.localY, z: a.localZ },
      orientation: { w: a.orientW, x: a.orientX, y: a.orientY, z: a.orientZ },
      scale: a.scale,
    })),
    // ── Entities (protocol.entity) ──
    entities: build.entities.map((e) => {
      const pos = JSON.parse(e.position);
      const state = JSON.parse(e.state);
      const components = JSON.parse(e.components);
      return {
        id: e.id,
        name: e.name,
        package: e.package ? {
          name: e.package.name,
          family: e.package.family,
          displayName: e.package.displayName,
        } : null,
        position: pos,
        components,
        state,
        // The runtime artifact for this entity's package (if available)
        artifact: e.package?.runtimeArtifacts?.find((a) => a.target === "playliquid-web") ?? null,
      };
    }),
    // ── Capability Policies (protocol.capabilities) ──
    capabilities: policies.map((p) => ({
      layer: p.layer,
      capability: p.capability,
      zoneName: p.zoneName,
      experienceName: p.experienceName,
      rules: JSON.parse(p.rules),
    })),
    // ── Runtime Config ──
    runtime: {
      adapter: manifest.runtimeConfig?.adapter ?? "simulator",
      theme: theme.artDirection ?? "stylized",
      coordinateSystem: "playliquid-world",
      // The protocol version this scene conforms to
      protocolVersion: "1.0.0",
    },
    // ── World Nodes (where this world is hosted) ──
    nodes: build.nodes.map((n) => ({
      id: n.id,
      host: n.host,
      endpoint: n.endpoint,
      status: n.status,
      capabilities: JSON.parse(n.capabilities),
    })),
  };

  return NextResponse.json(scene);
}
