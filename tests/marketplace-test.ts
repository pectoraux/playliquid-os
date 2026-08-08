// ════════════════════════════════════════════════════════════════
// PLAYLIQUID MARKETPLACE ACCEPTANCE TEST (Phase N)
// ════════════════════════════════════════════════════════════════
//
// Tests the real Registry/Marketplace:
//   1. Publish a package version (v1.0.0) — certify at publish time
//   2. Publish a second version (v1.1.0) — version bump
//   3. Publish a third version (v2.0.0) — major bump
//   4. Semver resolve: "latest", exact, "^1.0.0", "~1.1.0"
//   5. Search by family + certification level
//   6. License enforcement: reject invalid license
//   7. Duplicate-version rejection
//   8. List all versions of a package
//   9. Download count increment
//
// Run: bun run tests/marketplace-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { db } from "../src/lib/db";
import * as marketplace from "../src/lib/playliquid/services/marketplace";

function log(msg: string) { console.log(msg); }

// A valid declarative artifact for testing
function makeArtifact(name: string, color: string) {
  return {
    abiVersion: "1.0.0",
    name,
    displayName: name,
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: { color },
    render: { behavior: "shape", params: { shape: "box", size: 5, color } },
  };
}

async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  Marketplace Acceptance Test (Phase N)                   ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;
  const testPkgName = `@marketplace-test/pkg-${Date.now()}`;

  // ── 1. Publish v1.0.0 ────────────────────────────────────────
  log("── 1. Publish v1.0.0 ──");
  try {
    const result = await marketplace.publishVersion({
      packageName: testPkgName,
      displayName: "Test Package",
      description: "A test package for the marketplace",
      family: "building",
      version: "1.0.0",
      artifact: makeArtifact(testPkgName, "#ff0000"),
      changelog: "Initial release",
      license: "MIT",
      publishedBy: "test-author",
      capabilities: ["test.cap"],
    });
    if (result.version.version === "1.0.0" && result.certification) { passed++; log("  ✅ PASS: v1.0.0 published + certified"); }
    else { failed++; log("  ❌ FAIL: publish v1.0.0"); }
  } catch (e) { failed++; log("  ❌ FAIL: " + (e as Error).message); }

  // ── 2. Publish v1.1.0 (version bump) ────────────────────────
  log("\n── 2. Publish v1.1.0 (minor bump) ──");
  try {
    const result = await marketplace.publishVersion({
      packageName: testPkgName,
      version: "1.1.0",
      artifact: makeArtifact(testPkgName, "#00ff00"),
      changelog: "Added green color",
      license: "MIT",
      family: "building",
    });
    if (result.version.version === "1.1.0") { passed++; log("  ✅ PASS: v1.1.0 published"); }
    else { failed++; log("  ❌ FAIL: publish v1.1.0"); }
  } catch (e) { failed++; log("  ❌ FAIL: " + (e as Error).message); }

  // ── 3. Publish v2.0.0 (major bump) ──────────────────────────
  log("\n── 3. Publish v2.0.0 (major bump) ──");
  try {
    const result = await marketplace.publishVersion({
      packageName: testPkgName,
      version: "2.0.0",
      artifact: makeArtifact(testPkgName, "#0000ff"),
      changelog: "Breaking: new color API",
      license: "MIT",
      family: "building",
    });
    if (result.version.version === "2.0.0") { passed++; log("  ✅ PASS: v2.0.0 published"); }
    else { failed++; log("  ❌ FAIL: publish v2.0.0"); }
  } catch (e) { failed++; log("  ❌ FAIL: " + (e as Error).message); }

  // ── 4. Semver resolution ────────────────────────────────────
  log("\n── 4. Semver resolution ──");
  const latest = await marketplace.resolveVersion(testPkgName, "latest");
  if (latest?.version === "2.0.0") { passed++; log("  ✅ PASS: latest → 2.0.0"); }
  else { failed++; log(`  ❌ FAIL: latest resolved to ${latest?.version} (expected 2.0.0)`); }

  const exact = await marketplace.resolveVersion(testPkgName, "1.0.0");
  if (exact?.version === "1.0.0") { passed++; log("  ✅ PASS: exact 1.0.0 → 1.0.0"); }
  else { failed++; log(`  ❌ FAIL: exact 1.0.0 resolved to ${exact?.version}`); }

  const caret = await marketplace.resolveVersion(testPkgName, "^1.0.0");
  if (caret?.version === "1.1.0") { passed++; log("  ✅ PASS: ^1.0.0 → 1.1.0 (highest compatible 1.x)"); }
  else { failed++; log(`  ❌ FAIL: ^1.0.0 resolved to ${caret?.version} (expected 1.1.0)`); }

  const tilde = await marketplace.resolveVersion(testPkgName, "~1.1.0");
  if (tilde?.version === "1.1.0") { passed++; log("  ✅ PASS: ~1.1.0 → 1.1.0 (highest 1.1.x)"); }
  else { failed++; log(`  ❌ FAIL: ~1.1.0 resolved to ${tilde?.version}`); }

  const noMatch = await marketplace.resolveVersion(testPkgName, "^3.0.0");
  if (noMatch === null) { passed++; log("  ✅ PASS: ^3.0.0 → null (no match)"); }
  else { failed++; log(`  ❌ FAIL: ^3.0.0 resolved to ${noMatch?.version} (expected null)`); }

  // ── 5. Search by family + certification ─────────────────────
  log("\n── 5. Search marketplace ──");
  const searchResult = await marketplace.searchMarketplace({ query: testPkgName, family: "building" });
  if (searchResult.packages.length >= 1 && searchResult.packages[0].versionCount >= 3) { passed++; log(`  ✅ PASS: search found package (${searchResult.packages[0].versionCount} versions)`); }
  else { failed++; log(`  ❌ FAIL: search found ${searchResult.packages.length} packages`); }

  const byCert = await marketplace.searchMarketplace({ query: testPkgName, certificationLevel: "verified" });
  if (byCert.packages.length >= 1) { passed++; log(`  ✅ PASS: certification filter (verified) found ${byCert.packages.length}`); }
  else { failed++; log("  ❌ FAIL: certification filter"); }

  // ── 6. License enforcement ──────────────────────────────────
  log("\n── 6. License enforcement ──");
  const validLic = marketplace.isValidLicense("MIT");
  const invalidLic = marketplace.isValidLicense("FAKE-LICENSE");
  if (validLic && !invalidLic) { passed++; log("  ✅ PASS: MIT valid, FAKE-LICENSE rejected"); }
  else { failed++; log(`  ❌ FAIL: license enforcement (valid=${validLic}, invalid=${invalidLic})`); }

  let invalidLicenseRejected = false;
  try {
    await marketplace.publishVersion({
      packageName: testPkgName + "-bad-license",
      version: "1.0.0",
      artifact: makeArtifact(testPkgName, "#000"),
      license: "FAKE-LICENSE",
      family: "building",
    });
  } catch (e) {
    invalidLicenseRejected = e instanceof Error && e.message.includes("invalid license");
  }
  if (invalidLicenseRejected) { passed++; log("  ✅ PASS: invalid license rejected at publish"); }
  else { failed++; log("  ❌ FAIL: invalid license not rejected"); }

  // ── 7. Duplicate-version rejection ──────────────────────────
  log("\n── 7. Duplicate-version rejection ──");
  let dupRejected = false;
  try {
    await marketplace.publishVersion({
      packageName: testPkgName,
      version: "1.0.0", // already published
      artifact: makeArtifact(testPkgName, "#fff"),
      license: "MIT",
      family: "building",
    });
  } catch (e) {
    dupRejected = e instanceof Error && e.message.includes("already published");
  }
  if (dupRejected) { passed++; log("  ✅ PASS: duplicate version 1.0.0 rejected"); }
  else { failed++; log("  ❌ FAIL: duplicate version not rejected"); }

  // ── 8. List all versions ────────────────────────────────────
  log("\n── 8. List all versions ──");
  const versions = await marketplace.listVersions(testPkgName);
  if (versions.length === 3 && versions[0].version === "2.0.0") { passed++; log(`  ✅ PASS: listed ${versions.length} versions (latest first: 2.0.0)`); }
  else { failed++; log(`  ❌ FAIL: listed ${versions.length} versions`); }

  // ── 9. Download count ───────────────────────────────────────
  log("\n── 9. Download count ──");
  const beforeDl = versions[0].downloadCount;
  await marketplace.recordDownload(versions[0].id);
  const afterDl = (await marketplace.listVersions(testPkgName))[0].downloadCount;
  if (afterDl === beforeDl + 1) { passed++; log(`  ✅ PASS: download count incremented (${beforeDl} → ${afterDl})`); }
  else { failed++; log(`  ❌ FAIL: download count (${beforeDl} → ${afterDl})`); }

  // ── Summary ──────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  Registry/Marketplace: publish, version, resolve, search. ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");

  // Cleanup
  await db.packageVersion.deleteMany({ where: { package: { name: testPkgName } } });
  await db.packageVersion.deleteMany({ where: { package: { name: testPkgName + "-bad-license" } } });
  await db.package.deleteMany({ where: { name: { in: [testPkgName, testPkgName + "-bad-license"] } } });
  await db.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
