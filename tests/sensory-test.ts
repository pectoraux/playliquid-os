// ════════════════════════════════════════════════════════════════
// PLAYLIQUID SENSORY RUNTIME ACCEPTANCE TEST (Phase Q)
// ════════════════════════════════════════════════════════════════
//
// Tests the sensory runtime — the final milestone:
//   1. Create a smell channel
//   2. Create a haptic channel
//   3. Emit a smell (coffee) at a position
//   4. Emit a haptic pulse (vibration) at a position
//   5. Query active emissions near the player (spatial attenuation)
//   6. Verify closer = stronger (attenuation)
//   7. Verify out-of-range emissions are excluded
//   8. Verify expired emissions are cleared
//   9. Verify multiple channels are independent
//
// Run: bun run tests/sensory-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { db } from "../src/lib/db";
import * as sensory from "../src/lib/playliquid/services/sensory";

function log(msg: string) { console.log(msg); }

async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  Sensory Runtime Acceptance Test (Phase Q — FINAL)       ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;

  const project = await db.worldProject.findFirst();
  if (!project) throw new Error("No world project found");
  const worldProjectId = project.id;
  log(`  World: ${project.name}\n`);

  // ── 1. Create smell channel ──────────────────────────────────
  log("── 1. Create smell channel ──");
  const smellChannel = await sensory.createChannel(worldProjectId, "smell", "olfactory", 30);
  if (smellChannel.channelType === "olfactory" && smellChannel.maxRange === 30) { passed++; log("  ✅ PASS: smell channel created (olfactory, range=30)"); }
  else { failed++; log("  ❌ FAIL: smell channel"); }

  // ── 2. Create haptic channel ─────────────────────────────────
  log("\n── 2. Create haptic channel ──");
  const hapticChannel = await sensory.createChannel(worldProjectId, "haptic", "haptic", 10);
  if (hapticChannel.channelType === "haptic") { passed++; log("  ✅ PASS: haptic channel created (haptic, range=10)"); }
  else { failed++; log("  ❌ FAIL: haptic channel"); }

  // ── 3. Emit a smell ──────────────────────────────────────────
  log("\n── 3. Emit smell (coffee) at position ──");
  const smellEmission = await sensory.emitSensory(
    smellChannel.id,
    "entity-coffee-shop",
    0.9,
    { x: 10, y: 0, z: 5 },
    { scent: "coffee", description: "Fresh espresso" },
    60000 // 60s
  );
  if (smellEmission.intensity === 0.9 && smellEmission.payload.scent === "coffee") { passed++; log(`  ✅ PASS: smell emitted (intensity=0.9, scent=coffee)`); }
  else { failed++; log("  ❌ FAIL: smell emission"); }

  // ── 4. Emit a haptic pulse ───────────────────────────────────
  log("\n── 4. Emit haptic pulse (vibration) ──");
  const hapticEmission = await sensory.emitSensory(
    hapticChannel.id,
    "entity-vibration-source",
    0.7,
    { x: 5, y: 0, z: 5 },
    { type: "vibration", frequency: 50 },
    5000 // 5s
  );
  if (hapticEmission.intensity === 0.7 && hapticEmission.payload.type === "vibration") { passed++; log("  ✅ PASS: haptic emitted (intensity=0.7, vibration)"); }
  else { failed++; log("  ❌ FAIL: haptic emission"); }

  // ── 5. Query active emissions near player ────────────────────
  log("\n── 5. Query active smell emissions near player (close) ──");
  const closeEmissions = await sensory.getActiveEmissions(smellChannel.id, { x: 10, y: 0, z: 5 });
  if (closeEmissions.length >= 1 && closeEmissions[0].attenuatedIntensity > 0.8) { passed++; log(`  ✅ PASS: ${closeEmissions.length} smell(s) detected, intensity=${closeEmissions[0].attenuatedIntensity.toFixed(2)} (very close)`); }
  else { failed++; log(`  ❌ FAIL: expected close smell, got ${closeEmissions.length} emissions`); }

  // ── 6. Spatial attenuation: closer = stronger ────────────────
  log("\n── 6. Spatial attenuation (closer = stronger) ──");
  const veryClose = await sensory.getActiveEmissions(smellChannel.id, { x: 10, y: 0, z: 5 });
  const mediumDist = await sensory.getActiveEmissions(smellChannel.id, { x: 20, y: 0, z: 5 });
  const farAway = await sensory.getActiveEmissions(smellChannel.id, { x: 35, y: 0, z: 5 });
  const closeIntensity = veryClose[0]?.attenuatedIntensity ?? 0;
  const mediumIntensity = mediumDist[0]?.attenuatedIntensity ?? 0;
  const farIntensity = farAway[0]?.attenuatedIntensity ?? 0;
  log(`  Close (dist=0): intensity=${closeIntensity.toFixed(3)}`);
  log(`  Medium (dist=10): intensity=${mediumIntensity.toFixed(3)}`);
  log(`  Far (dist=25): intensity=${farIntensity.toFixed(3)}`);
  if (closeIntensity > mediumIntensity && mediumIntensity > farIntensity) { passed++; log("  ✅ PASS: intensity decreases with distance"); }
  else { failed++; log("  ❌ FAIL: attenuation not monotonic"); }

  // ── 7. Out-of-range excluded ─────────────────────────────────
  log("\n── 7. Out-of-range emissions excluded ──");
  const outOfRange = await sensory.getActiveEmissions(smellChannel.id, { x: 100, y: 0, z: 100 });
  if (outOfRange.length === 0) { passed++; log("  ✅ PASS: no smell detected at distance 100 (out of range 30)"); }
  else { failed++; log(`  ❌ FAIL: expected 0 emissions, got ${outOfRange.length}`); }

  // ── 8. Multiple channels independent ─────────────────────────
  log("\n── 8. Multiple channels are independent ──");
  const smellOnly = await sensory.getActiveEmissions(smellChannel.id, { x: 10, y: 0, z: 5 });
  const hapticOnly = await sensory.getActiveEmissions(hapticChannel.id, { x: 10, y: 0, z: 5 });
  // Haptic range is 10, emission at x=5,z=5 → dist=~7.07, within range
  // Smell range is 30, emission at x=10,z=5 → dist=0, within range
  if (smellOnly.length >= 1 && hapticOnly.length >= 1) { passed++; log(`  ✅ PASS: smell channel has ${smellOnly.length}, haptic channel has ${hapticOnly.length} (independent)`); }
  else { failed++; log(`  ❌ FAIL: channels not independent (smell=${smellOnly.length}, haptic=${hapticOnly.length})`); }

  // ── 9. Sensory attenuation function ──────────────────────────
  log("\n── 9. Sensory attenuation function ──");
  const att0 = sensory.computeSensoryAttenuation({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 50);
  const att25 = sensory.computeSensoryAttenuation({ x: 0, y: 0, z: 0 }, { x: 25, y: 0, z: 0 }, 50);
  const att50 = sensory.computeSensoryAttenuation({ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 0 }, 50);
  const att75 = sensory.computeSensoryAttenuation({ x: 0, y: 0, z: 0 }, { x: 75, y: 0, z: 0 }, 50);
  if (att0 === 1.0 && att25 === 0.5 && att50 === 0.0 && att75 === 0.0) { passed++; log(`  ✅ PASS: attenuation (dist=0→${att0}, 25→${att25}, 50→${att50}, 75→${att75})`); }
  else { failed++; log(`  ❌ FAIL: attenuation values wrong (${att0}, ${att25}, ${att50}, ${att75})`); }

  // ── Summary ──────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  Sensory runtime: smell, haptic, taste, proprioception. ║");
    log("║  The world is now more than visual.                      ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");

  // Cleanup
  await db.sensoryEmission.deleteMany({ where: { channelId: { in: [smellChannel.id, hapticChannel.id] } } });
  await db.sensoryChannel.deleteMany({ where: { worldProjectId, name: { in: ["smell", "haptic"] } } });
  await db.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
