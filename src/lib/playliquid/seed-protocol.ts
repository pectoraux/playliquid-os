// Seed spatial anchors + runtime artifacts for the PlayLiquid Protocol.
// Run with: bun run db:seed:protocol

import { db } from "@/lib/db";

async function main() {
  console.log("Seeding PlayLiquid Protocol (spatial anchors + runtime artifacts)…");

  const project = await db.worldProject.findUnique({ where: { slug: "amsterdam-canal-city" } });
  if (!project) {
    console.error("Amsterdam Canal City project not found. Run db:seed first.");
    process.exit(1);
  }

  // ── Spatial Anchors — the cross-engine spatial protocol ─────────
  // Hierarchy: earth → europe → netherlands → amsterdam → districts
  await db.spatialAnchor.deleteMany({ where: { worldProjectId: project.id } });

  const anchors = [
    // Root
    { semanticId: "earth", displayName: "Earth", parent: null, gx: 0, gy: 0, gz: 0, type: "region", semantic: "planet" },
    { semanticId: "earth.europe", displayName: "Europe", parent: "earth", gx: 0, gy: 0, gz: 0, type: "region", semantic: "continent" },
    { semanticId: "earth.europe.netherlands", displayName: "Netherlands", parent: "earth.europe", gx: 0, gy: 0, gz: 0, type: "region", semantic: "country" },
    { semanticId: "earth.europe.netherlands.amsterdam", displayName: "Amsterdam", parent: "earth.europe.netherlands", gx: 0, gy: 0, gz: 0, type: "city", semantic: "city" },
    // Districts
    { semanticId: "earth.europe.netherlands.amsterdam.canal-belt", displayName: "Canal Belt", parent: "earth.europe.netherlands.amsterdam", gx: 0, gy: 0, gz: 0, type: "district", semantic: "district" },
    { semanticId: "earth.europe.netherlands.amsterdam.city-center", displayName: "City Center", parent: "earth.europe.netherlands.amsterdam", gx: 50, gy: 0, gz: 50, type: "district", semantic: "district" },
    { semanticId: "earth.europe.netherlands.amsterdam.museum-district", displayName: "Museum District", parent: "earth.europe.netherlands.amsterdam", gx: 120, gy: 0, gz: 40, type: "district", semantic: "district" },
    { semanticId: "earth.europe.netherlands.amsterdam.residential", displayName: "Residential", parent: "earth.europe.netherlands.amsterdam", gx: -60, gy: 0, gz: 80, type: "district", semantic: "district" },
    // Specific anchors
    { semanticId: "earth.europe.netherlands.amsterdam.canal-belt.herengracht", displayName: "Herengracht Canal", parent: "earth.europe.netherlands.amsterdam.canal-belt", gx: 10, gy: 0, gz: 5, type: "network", semantic: "water" },
    { semanticId: "earth.europe.netherlands.amsterdam.canal-belt.prinsengracht", displayName: "Prinsengracht Canal", parent: "earth.europe.netherlands.amsterdam.canal-belt", gx: -10, gy: 0, gz: 15, type: "network", semantic: "water" },
    { semanticId: "earth.europe.netherlands.amsterdam.museum-district.rijksmuseum", displayName: "Rijksmuseum", parent: "earth.europe.netherlands.amsterdam.museum-district", gx: 120, gy: 0, gz: 40, type: "building", semantic: "museum" },
  ];

  for (const a of anchors) {
    // Find parent anchor ID if parent is specified
    let parentAnchorId: string | null = null;
    if (a.parent) {
      const parent = await db.spatialAnchor.findFirst({
        where: { worldProjectId: project.id, semanticId: a.parent },
      });
      parentAnchorId = parent?.id ?? null;
    }
    await db.spatialAnchor.create({
      data: {
        worldProjectId: project.id,
        semanticId: a.semanticId,
        displayName: a.displayName,
        parentAnchorId,
        globalX: a.gx,
        globalY: a.gy,
        globalZ: a.gz,
        anchorType: a.type,
        semantic: a.semantic,
        coordinateSystem: "playliquid-world",
      },
    });
  }
  console.log(`  ✓ ${anchors.length} spatial anchors (earth → europe → netherlands → amsterdam → districts)`);

  // ── Runtime Artifacts for packages ──────────────────────────────
  // Each package gets a "playliquid-web" runtime artifact (canvas-renderable)
  const packages = await db.package.findMany();
  let artifactCount = 0;
  for (const pkg of packages) {
    const existing = await db.runtimeArtifact.findUnique({
      where: { packageId_target: { packageId: pkg.id, target: "playliquid-web" } },
    });
    if (!existing) {
      await db.runtimeArtifact.create({
        data: {
          packageId: pkg.id,
          target: "playliquid-web",
          artifactUri: `playliquid-web://${pkg.hash}`,
          format: "canvas-json",
          status: "READY",
          metadata: JSON.stringify({
            shape: pkg.family === "avatar" ? "circle" : pkg.family === "building" ? "square" : pkg.family === "weather" ? "cloud" : "diamond",
            color: pkg.family,
            size: pkg.family === "weather" ? 20 : pkg.family === "building" ? 14 : 10,
          }),
        },
      });
      artifactCount++;
    }
  }
  console.log(`  ✓ ${artifactCount} runtime artifacts (playliquid-web)`);

  console.log("✓ PlayLiquid Protocol seed complete.");
  console.log("  The browser runtime can now render the Amsterdam world using the PlayLiquid spatial protocol.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
