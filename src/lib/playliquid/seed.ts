// Seed the Playliquid OS with example primitives so the console is alive on first load.
// Run with: bun run src/lib/playliquid/seed.ts

import { db } from "@/lib/db";
import { contentHash } from "./hashing";

async function main() {
  console.log("Seeding Playliquid OS…");

  // wipe (dev only)
  await db.kernelEvent.deleteMany();
  await db.entity.deleteMany();
  await db.worldNode.deleteMany();
  await db.worldBuildPackage.deleteMany();
  await db.worldBuild.deleteMany();
  await db.interface.deleteMany();
  await db.generationRequest.deleteMany();
  await db.package.deleteMany();
  await db.specification.deleteMany();
  await db.worldProject.deleteMany();

  // ── A canonical world specification ─────────────────────────────
  const spec = await db.specification.create({
    data: {
      naturalLanguage: "A cozy Amsterdam-canal-city world, 17th-century brick architecture, walkable, with avatars and weather.",
      canonical: JSON.stringify({
        name: "@worlds/amsterdam-canal",
        family: "world",
        era: "17th-century",
        artDirection: "realistic-painterly",
        scale: "city",
        coordinateSystem: " cartesian-meters",
      }),
      kind: "world",
      theme: JSON.stringify({
        era: "17th-century",
        artDirection: "realistic-painterly",
        scale: "city",
        coordinateSystem: "cartesian-meters",
        architectureLanguage: "dutch-renaissance",
        materialLanguage: "brick-glass-water",
        lighting: "soft-overcast",
        colorLanguage: "warm-earthen",
        technologyLevel: "pre-industrial",
        allowedFamilies: ["building", "road", "vehicle", "avatar", "weather", "water", "physics"],
        preferredFamilies: ["building", "road", "avatar"],
        excludedFamilies: ["cyberpunk", "sci-fi"],
      }),
      spatialRules: JSON.stringify({ scale: "city", anchorable: true }),
      policies: JSON.stringify({ reuse: "auto" }),
    },
  });

  // ── The World Project ───────────────────────────────────────────
  const project = await db.worldProject.create({
    data: {
      name: "Amsterdam Canal City",
      slug: "amsterdam-canal-city",
      description: "A walkable 17th-century canal world. Seed world for the Playliquid OS MVP.",
      theme: spec.theme!,
      rules: JSON.stringify({ gravity: 9.8, dayNightCycle: true, maxAvatars: 64 }),
      packageManifest: JSON.stringify([
        "@playliquid/infrastructure/canal-water",
        "@playliquid/roads/brick-cobblestone",
        "@playliquid/buildings/canal-house",
        "@playliquid/avatars/walker",
        "@playliquid/weather/dutch-overcast",
      ]),
      contributors: JSON.stringify(["@orchestrator", "@world-team"]),
      specificationId: spec.id,
    },
  });

  // ── Packages ───────────────────────────────────────────────────
  const packages = [
    {
      name: "@playliquid/infrastructure/canal-water",
      displayName: "Canal Water System",
      description: "Animated water plane for canals. Provides spatial.anchor; requires physics.fluid.",
      family: "infrastructure",
      provides: [{ name: "spatial.anchor", family: "spatial", description: "Anchor surface for waterfront buildings" }],
      requires: [{ name: "physics.fluid", family: "physics", description: "Fluid simulation for water surface" }],
      capabilities: ["water.render", "water.flow"],
      spec: { scale: "large", anchorable: true, material: "water" },
    },
    {
      name: "@playliquid/roads/brick-cobblestone",
      displayName: "Brick Cobblestone Road",
      description: "Procedural cobblestone road segments. Provides navigation.walkable.",
      family: "road",
      provides: [{ name: "navigation.walkable", family: "navigation", description: "Walkable surface for avatars" }],
      requires: [{ name: "spatial.anchor", family: "spatial", description: "Anchored to terrain" }],
      capabilities: ["road.path", "road.material"],
      spec: { scale: "medium", anchorable: true, material: "cobblestone" },
    },
    {
      name: "@playliquid/buildings/canal-house",
      displayName: "Amsterdam Canal House",
      description: "Tall narrow brick canal house with gabled roof. 17th-century Dutch renaissance.",
      family: "building",
      provides: [{ name: "spatial.anchor", family: "spatial", description: "Anchors to a road/waterfront" }],
      requires: [{ name: "navigation.walkable", family: "navigation", description: "Needs walkable ground" }],
      capabilities: ["building.enter", "building.window", "building.roof"],
      spec: { scale: "medium", anchorable: true, material: "brick", floors: 5 },
    },
    {
      name: "@playliquid/avatars/walker",
      displayName: "Walker Avatar",
      description: "First-person walker avatar. Provides avatar.movement; requires navigation.walkable.",
      family: "avatar",
      provides: [{ name: "avatar.movement", family: "avatar", description: "Movement + look input" }],
      requires: [{ name: "navigation.walkable", family: "navigation", description: "Walkable surface" }],
      capabilities: ["avatar.move", "avatar.look", "avatar.interact"],
      spec: { scale: "small", anchorable: false, height: 1.8 },
    },
    {
      name: "@playliquid/weather/dutch-overcast",
      displayName: "Dutch Overcast Weather",
      description: "Soft overcast sky with occasional drizzle. Provides weather.sky.",
      family: "weather",
      provides: [{ name: "weather.sky", family: "weather", description: "Sky dome + lighting" }],
      requires: [],
      capabilities: ["weather.clouds", "weather.drizzle"],
      spec: { scale: "planetary", anchorable: false },
    },
    {
      name: "@playliquid/physics/simple-rigid",
      displayName: "Simple Rigid-body Physics",
      description: "Simulator physics adapter: gravity + collision. Provides physics.fluid and physics.collision.",
      family: "physics",
      provides: [
        { name: "physics.fluid", family: "physics", description: "Basic fluid solver" },
        { name: "physics.collision", family: "physics", description: "AABB collision" },
      ],
      requires: [],
      capabilities: ["physics.gravity", "physics.collision"],
      spec: { scale: "city", adapter: "simulator" },
    },
  ];

  const createdPackages = [];
  for (const p of packages) {
    const hash = contentHash({ name: p.name, spec: p.spec, v: "1.0.0" });
    const pkg = await db.package.create({
      data: {
        name: p.name,
        displayName: p.displayName,
        description: p.description,
        family: p.family,
        version: "1.0.0",
        hash,
        manifest: JSON.stringify({ entrypoint: "index.js", runtime: "simulator", resources: [], config: {} }),
        specification: JSON.stringify({ ...p.spec, name: p.name }),
        artifactUri: `memory://${hash}`,
        provenance: JSON.stringify({ generator: "human", generatedAt: new Date().toISOString(), source: "seed" }),
        certification: JSON.stringify({ signed: true, level: "verified", by: "playliquid-seed", checks: ["specification-valid", "interfaces-declared", "hash-verified"] }),
        license: "MIT",
        capabilities: JSON.stringify(p.capabilities),
        specRefId: spec.id,
        provides: {
          create: p.provides.map((iface) => ({
            name: iface.name,
            family: iface.family,
            version: "1.0.0",
            direction: "provides",
            schema: JSON.stringify({}),
            description: iface.description,
          })),
        },
        requires: {
          create: p.requires.map((iface) => ({
            name: iface.name,
            family: iface.family,
            version: "1.0.0",
            direction: "requires",
            schema: JSON.stringify({}),
            description: iface.description,
          })),
        },
      },
      include: { provides: true, requires: true },
    });
    createdPackages.push(pkg);
  }

  // ── A ready World Build (composition of all seed packages) ──────
  const manifest = {
    specificationHash: contentHash("amsterdam-canal-city-v1"),
    packageVersions: Object.fromEntries(createdPackages.map((p) => [p.name, p.version])),
    resolvedDependencies: [
      { from: "@playliquid/buildings/canal-house", to: "@playliquid/roads/brick-cobblestone", contract: "navigation.walkable" },
      { from: "@playliquid/roads/brick-cobblestone", to: "@playliquid/infrastructure/canal-water", contract: "spatial.anchor" },
      { from: "@playliquid/buildings/canal-house", to: "@playliquid/infrastructure/canal-water", contract: "spatial.anchor" },
      { from: "@playliquid/avatars/walker", to: "@playliquid/roads/brick-cobblestone", contract: "navigation.walkable" },
      { from: "@playliquid/infrastructure/canal-water", to: "@playliquid/physics/simple-rigid", contract: "physics.fluid" },
    ],
    interfaceConnections: [
      { provider: "@playliquid/roads/brick-cobblestone", consumer: "@playliquid/buildings/canal-house", contract: "navigation.walkable" },
      { provider: "@playliquid/infrastructure/canal-water", consumer: "@playliquid/roads/brick-cobblestone", contract: "spatial.anchor" },
      { provider: "@playliquid/infrastructure/canal-water", consumer: "@playliquid/buildings/canal-house", contract: "spatial.anchor" },
      { provider: "@playliquid/roads/brick-cobblestone", consumer: "@playliquid/avatars/walker", contract: "navigation.walkable" },
      { provider: "@playliquid/physics/simple-rigid", consumer: "@playliquid/infrastructure/canal-water", contract: "physics.fluid" },
    ],
    spatialGraph: createdPackages.map((p, i) => ({
      entity: p.name,
      parent: p.family === "building" ? "region.root" : undefined,
      anchor: { x: (i % 5) * 12, y: p.family === "weather" ? 40 : p.family === "building" ? 8 : 0, z: Math.floor(i / 5) * 12 },
    })),
    capabilityPolicies: Object.fromEntries(createdPackages.flatMap((p) => (JSON.parse(p.capabilities) as string[]).map((c) => [c, `granted:${p.name}`]))),
    runtimeConfig: { adapter: "simulator", theme: "realistic-painterly" },
    theme: JSON.parse(spec.theme!),
  };

  const build = await db.worldBuild.create({
    data: {
      version: 1,
      worldProjectId: project.id,
      manifest: JSON.stringify(manifest),
      hash: contentHash({ manifest, v: 1, projectId: project.id }),
      status: "ready",
      packages: {
        create: createdPackages.map((p) => ({ packageId: p.id })),
      },
    },
  });

  // ── A running World Node ────────────────────────────────────────
  const node = await db.worldNode.create({
    data: {
      worldBuildId: build.id,
      host: "vercel",
      endpoint: "/worlds/amsterdam-canal-city/builds/1",
      status: "running",
      health: JSON.stringify({ uptime: 0, entities: createdPackages.length, fps: 60 }),
      capabilities: JSON.stringify({ spatial: true, persistence: "memory", networking: "local" }),
      startedAt: new Date(),
    },
  });

  // ── Seed entities (one per package) ─────────────────────────────
  for (const p of createdPackages) {
    await db.entity.create({
      data: {
        worldBuildId: build.id,
        packageId: p.id,
        name: p.displayName,
        position: JSON.stringify({ x: Math.random() * 24, y: 0, z: Math.random() * 24 }),
        components: JSON.stringify(["transform", "renderable"]),
        state: JSON.stringify({ health: 100, visible: true }),
      },
    });
  }

  // ── A couple of kernel events ───────────────────────────────────
  await db.kernelEvent.create({
    data: {
      type: "node.running",
      payload: JSON.stringify({ nodeId: node.id, host: "vercel", entities: createdPackages.length }),
    },
  });
  await db.kernelEvent.create({
    data: { type: "scheduler.tick", payload: JSON.stringify({ nodeId: node.id, ts: Date.now() }) },
  });

  console.log("✓ Seeded Playliquid OS:");
  console.log(`  - ${createdPackages.length} packages`);
  console.log(`  - 1 world project: ${project.slug}`);
  console.log(`  - 1 world build (v1, ready)`);
  console.log(`  - 1 running world node (vercel)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
