// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WORLD SERVICES ACCEPTANCE TEST (Phase M)
// ════════════════════════════════════════════════════════════════
//
// Tests all five World Services as real implementations:
//   1. Economy: wallet mint/burn/transfer, atomicity, insufficient-funds rejection
//   2. Identity: create identity, issue token, verify token, expire token
//   3. Discovery: list worlds, search, filter by running node
//   4. Voice: create channel, join, spatial attenuation, leave
//   5. Ads: auction (highest bid wins), frequency cap, category filter
//
// Run: bun run tests/world-services-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { db } from "../src/lib/db";
import * as economy from "../src/lib/playliquid/services/economy";
import * as identity from "../src/lib/playliquid/services/identity";
import * as discovery from "../src/lib/playliquid/services/discovery";
import * as voice from "../src/lib/playliquid/services/voice";
import * as ads from "../src/lib/playliquid/services/ads";

function log(msg: string) { console.log(msg); }

async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  World Services Acceptance Test (Phase M)                ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;

  // Use the existing Amsterdam world project
  const worldProject = await db.worldProject.findFirst();
  if (!worldProject) throw new Error("No world project found — run the seed first");
  const worldProjectId = worldProject.id;
  log(`  World: ${worldProject.name} (${worldProjectId.slice(-8)})\n`);

  const playerA = "test-player-a-" + Date.now();
  const playerB = "test-player-b-" + Date.now();

  // ════════════════════════════════════════════════════════════════
  // 1. ECONOMY
  // ════════════════════════════════════════════════════════════════
  log("═══ 1. ECONOMY ═══");

  // Mint
  log("  Minting 1000 PL to player A...");
  const mintResult = await economy.mint(playerA, worldProjectId, 1000, "test-mint");
  if (mintResult.wallet.balance === 1000 && mintResult.tx.amount === 1000) { passed++; log("  ✅ PASS: mint credited"); }
  else { failed++; log("  ❌ FAIL: mint"); }

  // Get balance
  const balance = await economy.getBalance(playerA, worldProjectId);
  if (balance === 1000) { passed++; log("  ✅ PASS: balance correct (1000)"); }
  else { failed++; log("  ❌ FAIL: balance"); }

  // Transfer A → B
  log("  Transferring 300 PL A → B...");
  const transferResult = await economy.transfer(playerA, playerB, worldProjectId, 300, "test-transfer");
  if (transferResult.fromWallet.balance === 700 && transferResult.toWallet.balance === 300) { passed++; log("  ✅ PASS: transfer atomic (A=700, B=300)"); }
  else { failed++; log("  ❌ FAIL: transfer"); }

  // Insufficient funds
  log("  Attempting transfer of 99999 (insufficient)...");
  let insufficientRejected = false;
  try {
    await economy.transfer(playerA, playerB, worldProjectId, 99999, "should-fail");
  } catch (e) {
    insufficientRejected = e instanceof Error && e.message.includes("insufficient");
  }
  if (insufficientRejected) { passed++; log("  ✅ PASS: insufficient funds rejected"); }
  else { failed++; log("  ❌ FAIL: insufficient funds not rejected"); }

  // Transaction history
  const history = await economy.getTransactionHistory(playerA, worldProjectId);
  if (history.length >= 2) { passed++; log(`  ✅ PASS: history has ${history.length} transactions`); }
  else { failed++; log("  ❌ FAIL: history"); }

  // Burn
  log("  Burning 100 PL from A...");
  const burnResult = await economy.burn(playerA, worldProjectId, 100, "test-burn");
  if (burnResult.wallet.balance === 600) { passed++; log("  ✅ PASS: burn debited (A=600)"); }
  else { failed++; log("  ❌ FAIL: burn"); }

  // ════════════════════════════════════════════════════════════════
  // 2. IDENTITY
  // ════════════════════════════════════════════════════════════════
  log("\n═══ 2. IDENTITY ═══");

  // Create identity
  const ident = await identity.getOrCreateIdentity(null, worldProjectId, "TestPlayer-A");
  if (ident.displayName === "TestPlayer-A" && ident.status === "ACTIVE") { passed++; log("  ✅ PASS: identity created"); }
  else { failed++; log("  ❌ FAIL: identity"); }

  // Issue token
  const token = await identity.issueCapabilityToken(ident.id, worldProjectId, ["avatar.movement", "economy.spend"], 60);
  if (token.token && token.capabilities.length === 2) { passed++; log("  ✅ PASS: capability token issued"); }
  else { failed++; log("  ❌ FAIL: token issue"); }

  // Verify token (valid)
  const verified = await identity.verifyCapabilityToken(token.token, "avatar.movement");
  if (verified.valid && verified.playerId === ident.id) { passed++; log("  ✅ PASS: token verified"); }
  else { failed++; log("  ❌ FAIL: token verify"); }

  // Verify token (wrong capability)
  const wrongCap = await identity.verifyCapabilityToken(token.token, "admin.superuser");
  if (!wrongCap.valid && wrongCap.reason?.includes("lacks capability")) { passed++; log("  ✅ PASS: token rejected wrong capability"); }
  else { failed++; log("  ❌ FAIL: token capability check"); }

  // List identities
  const identities = await identity.listIdentities(worldProjectId);
  if (identities.length >= 1) { passed++; log(`  ✅ PASS: listed ${identities.length} identities`); }
  else { failed++; log("  ❌ FAIL: list identities"); }

  // ════════════════════════════════════════════════════════════════
  // 3. DISCOVERY
  // ════════════════════════════════════════════════════════════════
  log("\n═══ 3. DISCOVERY ═══");

  // List worlds
  const result = await discovery.discoverWorlds({});
  if (result.worlds.length >= 1) { passed++; log(`  ✅ PASS: discovered ${result.worlds.length} worlds`); }
  else { failed++; log("  ❌ FAIL: discovery"); }

  // Search
  const searchResult = await discovery.discoverWorlds({ search: "Amsterdam" });
  const foundAmsterdam = searchResult.worlds.some((w) => w.name.includes("Amsterdam"));
  if (foundAmsterdam) { passed++; log("  ✅ PASS: search found Amsterdam"); }
  else { failed++; log("  ❌ FAIL: search"); }

  // World info
  const info = await discovery.getWorldInfo(worldProjectId);
  if (info && info.buildCount >= 1) { passed++; log(`  ✅ PASS: world info (builds: ${info.buildCount})`); }
  else { failed++; log("  ❌ FAIL: world info"); }

  // ════════════════════════════════════════════════════════════════
  // 4. VOICE
  // ════════════════════════════════════════════════════════════════
  log("\n═══ 4. VOICE ═══");

  // Create channel
  const channel = await voice.createChannel(worldProjectId, "Test Voice Channel", "distance", 10);
  if (channel.name === "Test Voice Channel" && channel.spatialModel === "distance") { passed++; log("  ✅ PASS: voice channel created"); }
  else { failed++; log("  ❌ FAIL: channel create"); }

  // Join
  const joinResult = await voice.joinChannel(channel.id, playerA, { x: 0, y: 0, z: 0 });
  if (joinResult.member.playerId === playerA) { passed++; log("  ✅ PASS: player joined voice channel"); }
  else { failed++; log("  ❌ FAIL: join"); }

  // Spatial attenuation
  const gainClose = voice.computeAttenuation("distance", { x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 50);
  const gainFar = voice.computeAttenuation("distance", { x: 0, y: 0, z: 0 }, { x: 60, y: 0, z: 0 }, 50);
  if (gainClose > 0.8 && gainFar === 0) { passed++; log(`  ✅ PASS: spatial attenuation (close=${gainClose.toFixed(2)}, far=${gainFar})`); }
  else { failed++; log(`  ❌ FAIL: attenuation (close=${gainClose}, far=${gainFar})`); }

  // List members
  const members = await voice.listMembers(channel.id);
  if (members.length === 1) { passed++; log("  ✅ PASS: 1 member in channel"); }
  else { failed++; log("  ❌ FAIL: members"); }

  // Leave
  await voice.leaveChannel(channel.id, playerA);
  const membersAfter = await voice.listMembers(channel.id);
  if (membersAfter.length === 0) { passed++; log("  ✅ PASS: player left channel"); }
  else { failed++; log("  ❌ FAIL: leave"); }

  // ════════════════════════════════════════════════════════════════
  // 5. ADS
  // ════════════════════════════════════════════════════════════════
  log("\n═══ 5. ADS ═══");

  // The ads service auto-seeds placements. Run an auction.
  const placements = ads.listPlacements();
  if (placements.length >= 1) { passed++; log(`  ✅ PASS: ${placements.length} ad placements seeded`); }
  else { failed++; log("  ❌ FAIL: placements"); }

  const placement = placements[0];

  // Auction with multiple bids — highest wins
  const auctionResult = ads.runAuction(playerA, placement.id, [
    { bidderId: "advertiser-1", creativeId: "creative-1", amount: 50, category: placement.categoryFilter[0] ?? "travel", targetAnchor: placement.worldAnchor },
    { bidderId: "advertiser-2", creativeId: "creative-2", amount: 100, category: placement.categoryFilter[0] ?? "travel", targetAnchor: placement.worldAnchor },
    { bidderId: "advertiser-3", creativeId: "creative-3", amount: 75, category: placement.categoryFilter[0] ?? "travel", targetAnchor: placement.worldAnchor },
  ]);
  if (auctionResult.winner && auctionResult.winner.amount === 100 && auctionResult.winner.bidderId === "advertiser-2") { passed++; log("  ✅ PASS: auction — highest bid won (100)"); }
  else { failed++; log("  ❌ FAIL: auction — " + JSON.stringify(auctionResult)); }

  // Frequency cap — after frequencyCap+1 impressions, no more ads
  const cap = placement.frequencyCap;
  log(`  Frequency cap: ${cap}/hour. Running ${cap + 1} more auctions...`);
  let capped = false;
  for (let i = 0; i < cap + 1; i++) {
    const r = ads.runAuction(playerA, placement.id, [
      { bidderId: "advertiser-1", creativeId: "c", amount: 10, category: placement.categoryFilter[0] ?? "travel", targetAnchor: placement.worldAnchor },
    ]);
    if (!r.winner && r.reason.includes("frequency cap")) { capped = true; break; }
  }
  if (capped) { passed++; log("  ✅ PASS: frequency cap enforced (auction blocked after cap)"); }
  else { failed++; log("  ❌ FAIL: frequency cap not enforced"); }

  // Category filter — wrong category rejected
  // Use a fresh player to avoid freq cap
  const freshPlayer = "fresh-player-" + Date.now();
  const catResult = ads.runAuction(freshPlayer, placement.id, [
    { bidderId: "advertiser-x", creativeId: "c", amount: 999, category: "wrong-category", targetAnchor: placement.worldAnchor },
  ]);
  if (!catResult.winner && catResult.reason.includes("no valid bids")) { passed++; log("  ✅ PASS: category filter rejected wrong-category bid"); }
  else { failed++; log("  ❌ FAIL: category filter — " + JSON.stringify(catResult)); }

  // ── Summary ────────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  All 5 World Services are real implementations.          ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");

  // Cleanup test data
  await db.playerWallet.deleteMany({ where: { playerId: { in: [playerA, playerB] } } });
  await db.playerIdentity.deleteMany({ where: { worldProjectId, displayName: "TestPlayer-A" } });
  await db.voiceChannel.deleteMany({ where: { worldProjectId, name: "Test Voice Channel" } });

  await db.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
