// Seed the new primitives: World Services, Capability Policies (Superman example),
// Spatial Slots, and avatar packages with declared capabilities.
// Run with: bun run db:seed:v2

import { db } from "@/lib/db";
import { contentHash } from "./hashing";

async function main() {
  console.log("Seeding Playliquid OS v2 (World Services + Capability Policies + Spatial Slots)…");

  // ── World Services (Primitive #10) ─────────────────────────────
  // Each service is honestly labeled with implementationStatus.
  const services = [
    {
      name: "playliquid.multiplayer",
      displayName: "Multiplayer & Replication",
      description: "Authoritative state replication, interest management, player sessions. OS substrate — packages never implement this.",
      category: "networking",
      contract: { provides: ["kernel.replication", "kernel.sessions"], requires: ["kernel.networking"] },
      provider: "playliquid",
      implementationStatus: "production",
      implementationNote: "WebSocket (socket.io) primary transport + SSE fallback. Bidirectional with acks. Concurrency-safe broadcast (seq captured at mutation time, synchronous before durable append). Proven 50 + 100 simultaneous clients with 0 per-client duplicate seqs, 0 out-of-order, 100% ack rate (tests/network-load-test.ts). 500 clients limited by sandbox memory, not transport. Single World Node; not yet distributed.",
    },
    {
      name: "playliquid.streaming",
      displayName: "Spatial Streaming",
      description: "Loads/unloads spatial cells based on player interest. Packages declare bounds + LOD; the OS handles the rest.",
      category: "streaming",
      contract: { provides: ["kernel.streaming", "kernel.spatial"], requires: ["kernel.scheduler"] },
      provider: "playliquid",
      implementationStatus: "contract-only",
      implementationNote: "No spatial partitioning, cell loading, or interest management yet.",
    },
    {
      name: "playliquid.persistence",
      displayName: "Persistence",
      description: "World and entity state survives restart. Adapter-based (Postgres/IPFS/local).",
      category: "persistence",
      contract: { provides: ["kernel.persistence"], requires: [] },
      provider: "playliquid",
      implementationStatus: "production",
      implementationNote: "Real PersistenceService adapter (interface + RemotePersistenceService over HTTP → control-plane durable store). Append-only WorldEvent log + WorldSnapshot checkpoints. Every acknowledged mutation is appended BEFORE the node replies (synchronous durability). Proven clean-machine recovery: kill -9 the node, destroy /tmp, start a fresh node → byte-exact state hash equality (tests/durability-acceptance.ts, both snapshot-only and replay paths). Single durable store; not yet multi-region replication/backup.",
    },
    {
      name: "playliquid.identity",
      displayName: "Identity & Auth",
      description: "Player identity, sessions, capability tokens.",
      category: "identity",
      contract: { provides: ["identity.sessions", "identity.tokens"], requires: [] },
      provider: "playliquid",
      implementationStatus: "partial",
      implementationNote: "NextAuth credentials provider exists for the console; not yet a world-player identity system.",
    },
    {
      name: "playliquid.voice",
      displayName: "Voice",
      description: "Spatial voice chat. Platform-provided; worlds opt in.",
      category: "voice",
      contract: { provides: ["voice.spatial", "voice.channels"], requires: ["kernel.networking"] },
      provider: "playliquid",
      implementationStatus: "contract-only",
      implementationNote: "No voice transport.",
    },
    {
      name: "playliquid.ads",
      displayName: "Advertising",
      description: "Ad contract service. Worlds declare ad policy; the OS handles auctions, billing, surfaces. Never LLM-generated.",
      category: "ads",
      contract: { provides: ["ads.surfaces", "ads.auction"], requires: ["identity.sessions"] },
      provider: "playliquid",
      implementationStatus: "contract-only",
      implementationNote: "No ad network adapter, auction, or billing.",
    },
    {
      name: "playliquid.economy",
      displayName: "Economy",
      description: "Currency, transactions, wallets. Platform service.",
      category: "economy",
      contract: { provides: ["economy.wallet", "economy.tx"], requires: ["identity.sessions"] },
      provider: "playliquid",
      implementationStatus: "contract-only",
      implementationNote: "No wallet, currency, or transaction implementation.",
    },
  ];

  for (const s of services) {
    await db.worldService.upsert({
      where: { name: s.name },
      update: {
        displayName: s.displayName,
        description: s.description,
        category: s.category,
        contract: JSON.stringify(s.contract),
        provider: s.provider,
        status: "ACTIVE",
        implementationStatus: s.implementationStatus,
        implementationNote: s.implementationNote,
        config: JSON.stringify({}),
      },
      create: {
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        category: s.category,
        contract: JSON.stringify(s.contract),
        provider: s.provider,
        status: "ACTIVE",
        implementationStatus: s.implementationStatus,
        implementationNote: s.implementationNote,
        config: JSON.stringify({}),
      },
    });
  }
  console.log(`  ✓ ${services.length} world services`);

  // ── Avatar packages with declared capabilities (Superman example) ──
  const avatars = [
    {
      name: "@playliquid/avatars/superman",
      displayName: "Superman Avatar",
      description: "Kryptonian avatar with flight, super strength, heat vision, and super speed.",
      capabilities: ["flight", "super_strength", "heat_vision", "super_speed", "avatar.movement"],
      provides: [{ name: "avatar.movement", family: "avatar", description: "Movement + look input" }],
      requires: [{ name: "navigation.walkable", family: "navigation", description: "Walkable surface" }],
      spec: { scale: "small", anchorable: false, height: 1.9, powers: ["flight", "super_strength", "heat_vision"] },
    },
    {
      name: "@playliquid/avatars/bird",
      displayName: "Bird Avatar",
      description: "Small bird avatar with flight and glide.",
      capabilities: ["flight", "glide", "avatar.movement"],
      provides: [{ name: "avatar.movement", family: "avatar", description: "Movement + look input" }],
      requires: [{ name: "spatial.anchor", family: "spatial", description: "Airspace anchor" }],
      spec: { scale: "small", anchorable: false, wingspan: 0.6 },
    },
    {
      name: "@playliquid/avatars/human",
      displayName: "Human Avatar",
      description: "Standard human avatar: walk, run, jump.",
      capabilities: ["walk", "run", "jump", "avatar.movement"],
      provides: [{ name: "avatar.movement", family: "avatar", description: "Movement + look input" }],
      requires: [{ name: "navigation.walkable", family: "navigation", description: "Walkable surface" }],
      spec: { scale: "small", anchorable: false, height: 1.8 },
    },
    {
      name: "@playliquid/avatars/dragon",
      displayName: "Dragon Avatar",
      description: "Large dragon avatar with flight and fire breath.",
      capabilities: ["flight", "fire_breath", "avatar.movement", "super_strength"],
      provides: [{ name: "avatar.movement", family: "avatar", description: "Movement + look input" }],
      requires: [{ name: "spatial.anchor", family: "spatial", description: "Airspace anchor" }],
      spec: { scale: "large", anchorable: false, wingspan: 8 },
    },
  ];

  for (const a of avatars) {
    const hash = contentHash({ name: a.name, spec: a.spec, v: "1.0.0" });
    await db.package.upsert({
      where: { name: a.name },
      update: {
        displayName: a.displayName,
        description: a.description,
        family: "avatar",
        version: "1.0.0",
        hash,
        capabilities: JSON.stringify(a.capabilities),
        specification: JSON.stringify({ ...a.spec, name: a.name }),
      },
      create: {
        name: a.name,
        displayName: a.displayName,
        description: a.description,
        family: "avatar",
        version: "1.0.0",
        hash,
        manifest: JSON.stringify({ entrypoint: "index.js", runtime: "simulator" }),
        specification: JSON.stringify({ ...a.spec, name: a.name }),
        artifactUri: `memory://${hash}`,
        provenance: JSON.stringify({ generator: "human", source: "seed-v2" }),
        certification: JSON.stringify({ signed: true, level: "verified", by: "playliquid-seed", checks: ["specification-valid"] }),
        license: "MIT",
        capabilities: JSON.stringify(a.capabilities),
        provides: {
          create: a.provides.map((i) => ({
            name: i.name,
            family: i.family,
            version: "1.0.0",
            direction: "provides",
            schema: JSON.stringify({}),
            description: i.description,
          })),
        },
        requires: {
          create: a.requires.map((i) => ({
            name: i.name,
            family: i.family,
            version: "1.0.0",
            direction: "requires",
            schema: JSON.stringify({}),
            description: i.description,
          })),
        },
      },
    });
  }
  console.log(`  ✓ ${avatars.length} avatar packages (Superman, Bird, Human, Dragon)`);

  // ── Capability Policies for the Amsterdam world (Superman example) ──
  const project = await db.worldProject.findUnique({ where: { slug: "amsterdam-canal-city" } });
  if (project) {
    // Clear old policies
    await db.capabilityPolicy.deleteMany({ where: { worldProjectId: project.id } });

    const policies = [
      // WORLD layer: flight is denied for Superman in this realistic world
      {
        layer: "world",
        capability: "flight",
        rules: JSON.stringify([
          { package: "@playliquid/avatars/superman", action: "deny", reason: "No flying in a realistic 17th-century city" },
          { package: "@playliquid/avatars/dragon", action: "deny", reason: "No dragons in Amsterdam" },
          { package: "@playliquid/avatars/bird", action: "allow", reason: "Birds can fly" },
          { packageFamily: "avatar", action: "deny", reason: "Default: no flight for avatars" },
        ]),
        priority: 10,
      },
      // WORLD layer: super_strength denied for everyone
      {
        layer: "world",
        capability: "super_strength",
        rules: JSON.stringify([
          { packageFamily: "avatar", action: "deny", reason: "No super strength in a realistic world" },
        ]),
        priority: 11,
      },
      // ZONE layer: in the "museum-district" zone, even Superman can fly (for an exhibit)
      {
        layer: "zone",
        zoneName: "museum-district",
        capability: "flight",
        rules: JSON.stringify([
          { package: "@playliquid/avatars/superman", action: "allow", reason: "Special exhibit allows flight" },
        ]),
        priority: 20,
      },
      // EXPERIENCE layer: during the "superman-event" experience, all Superman powers are restored
      {
        layer: "experience",
        experienceName: "superman-event",
        capability: "flight",
        rules: JSON.stringify([
          { package: "@playliquid/avatars/superman", action: "allow", reason: "Event restores powers" },
        ]),
        priority: 30,
      },
      {
        layer: "experience",
        experienceName: "superman-event",
        capability: "super_strength",
        rules: JSON.stringify([
          { package: "@playliquid/avatars/superman", action: "allow", reason: "Event restores powers" },
        ]),
        priority: 31,
      },
      // WORLD layer: heat_vision limited everywhere
      {
        layer: "world",
        capability: "heat_vision",
        rules: JSON.stringify([
          { package: "@playliquid/avatars/superman", action: "limit", params: { maxRange: 5 }, reason: "Heat vision limited for safety" },
        ]),
        priority: 12,
      },
    ];

    for (const p of policies) {
      await db.capabilityPolicy.create({
        data: {
          worldProjectId: project.id,
          layer: p.layer,
          zoneName: p.zoneName ?? null,
          experienceName: p.experienceName ?? null,
          capability: p.capability,
          rules: p.rules,
          priority: p.priority,
        },
      });
    }
    console.log(`  ✓ ${policies.length} capability policies (Superman example: flight denied world-wide, allowed in museum-district zone + superman-event experience)`);

    // ── Spatial Slots for Amsterdam ──────────────────────────────
    await db.spatialSlot.deleteMany({ where: { worldProjectId: project.id } });
    const slots = [
      { name: "canal-network", displayName: "Canal Network", slotType: "network", acceptedFamilies: ["infrastructure"], capacity: null, bounds: { x: 0, y: 0, z: 0, w: 500, h: 10, d: 500 } },
      { name: "city-center", displayName: "City Center", slotType: "district", acceptedFamilies: ["building", "road"], capacity: 50, bounds: { x: 100, y: 0, z: 100, w: 200, h: 50, d: 200 } },
      { name: "museum-district", displayName: "Museum District", slotType: "district", acceptedFamilies: ["building"], capacity: 10, bounds: { x: 350, y: 0, z: 100, w: 150, h: 50, d: 150 } },
      { name: "residential", displayName: "Residential Plots", slotType: "plot", acceptedFamilies: ["building"], capacity: 200, bounds: { x: 0, y: 0, z: 300, w: 500, h: 30, d: 200 } },
    ];
    for (const s of slots) {
      await db.spatialSlot.create({
        data: {
          worldProjectId: project.id,
          name: s.name,
          displayName: s.displayName,
          slotType: s.slotType,
          bounds: JSON.stringify(s.bounds),
          acceptedFamilies: JSON.stringify(s.acceptedFamilies),
          capacity: s.capacity,
        },
      });
    }
    console.log(`  ✓ ${slots.length} spatial slots (canal-network, city-center, museum-district, residential)`);

    // ── Bind some services to the Amsterdam world ────────────────
    const mpService = await db.worldService.findUnique({ where: { name: "playliquid.multiplayer" } });
    const streamService = await db.worldService.findUnique({ where: { name: "playliquid.streaming" } });
    const persistService = await db.worldService.findUnique({ where: { name: "playliquid.persistence" } });
    if (mpService) await db.worldServiceBinding.upsert({ where: { worldProjectId_worldServiceId: { worldProjectId: project.id, worldServiceId: mpService.id } }, update: {}, create: { worldProjectId: project.id, worldServiceId: mpService.id, enabled: true, config: JSON.stringify({ maxPlayers: 64 }) } });
    if (streamService) await db.worldServiceBinding.upsert({ where: { worldProjectId_worldServiceId: { worldProjectId: project.id, worldServiceId: streamService.id } }, update: {}, create: { worldProjectId: project.id, worldServiceId: streamService.id, enabled: true, config: JSON.stringify({ cellSize: 50 }) } });
    if (persistService) await db.worldServiceBinding.upsert({ where: { worldProjectId_worldServiceId: { worldProjectId: project.id, worldServiceId: persistService.id } }, update: {}, create: { worldProjectId: project.id, worldServiceId: persistService.id, enabled: true, config: JSON.stringify({ adapter: "postgres" }) } });
    console.log(`  ✓ 3 services bound to Amsterdam (multiplayer, streaming, persistence)`);
  }

  // ── A sample contribution ──────────────────────────────────────
  if (project) {
    const existing = await db.contribution.findFirst({ where: { worldProjectId: project.id, title: "Rijksmuseum reconstruction" } });
    if (!existing) {
      const housePkg = await db.package.findFirst({ where: { name: "@playliquid/buildings/canal-house" } });
      if (housePkg) {
        await db.contribution.create({
          data: {
            worldProjectId: project.id,
            packageId: housePkg.id,
            contributorName: "@rijksmuseum-team",
            title: "Rijksmuseum reconstruction",
            description: "Faithful reconstruction of the Rijksmuseum exterior, attaches to the museum-district slot.",
            targetSlot: "museum-district",
            status: "PENDING",
          },
        });
        console.log(`  ✓ 1 sample contribution (Rijksmuseum reconstruction → museum-district)`);
      }
    }
  }

  console.log("✓ Playliquid OS v2 seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
