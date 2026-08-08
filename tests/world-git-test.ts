// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WORLD GIT ACCEPTANCE TEST (Phase O)
// ════════════════════════════════════════════════════════════════
//
// Tests the real production Git for World Projects:
//   1. Ensure main branch exists
//   2. Commit to main
//   3. Create a feature branch
//   4. Commit to feature branch
//   5. Create a PR (feature → main)
//   6. Review + approve the PR
//   7. Merge the PR (fast-forward main)
//   8. Compose a build from main (immutable, content-addressed)
//   9. Deploy the build
//  10. Compose a second build, deploy it
//  11. Rollback to the first build
//  12. Verify reproducibility (same lock → same hash)
//
// Run: bun run tests/world-git-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { db } from "../src/lib/db";
import * as git from "../src/lib/playliquid/services/world-git";
import * as pipeline from "../src/lib/playliquid/services/build-pipeline";

function log(msg: string) { console.log(msg); }

async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  World Git Acceptance Test (Phase O)                     ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;

  const project = await db.worldProject.findFirst();
  if (!project) throw new Error("No world project found");
  const projectId = project.id;
  log(`  World: ${project.name}\n`);

  // Clean up any leftover test data from prior runs
  await db.pullRequest.deleteMany({ where: { worldProjectId: projectId, contributorName: "bob" } });
  await db.worldCommit.deleteMany({ where: { worldProjectId: projectId, authorName: { in: ["alice", "bob"] } } });
  await db.worldBranch.deleteMany({ where: { worldProjectId: projectId, name: "feature/museum-district" } });
  // Reset main branch head (so commits start fresh)
  const existingMain = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId: projectId, name: "main" } },
  });
  if (existingMain) {
    await db.worldBranch.update({ where: { id: existingMain.id }, data: { headCommitId: null } });
  }

  // ── 1. Ensure main branch ────────────────────────────────────
  log("── 1. Ensure main branch ──");
  const main = await git.ensureMainBranch(projectId);
  if (main.name === "main") { passed++; log("  ✅ PASS: main branch exists"); }
  else { failed++; log("  ❌ FAIL: main branch"); }

  // ── 2. Commit to main ───────────────────────────────────────
  log("\n── 2. Commit to main ──");
  const commit1 = await git.commit(projectId, "main", "alice", "Initial world: canal houses", [
    "@playliquid/buildings/amsterdam-canal-house",
    "@playliquid/vehicles/tram",
  ]);
  if (commit1.hash && commit1.parentCommitId === null) { passed++; log(`  ✅ PASS: commit ${commit1.hash.slice(0, 12)} (root)`); }
  else { failed++; log("  ❌ FAIL: commit to main"); }

  const commit2 = await git.commit(projectId, "main", "alice", "Add weather package", [
    "@playliquid/buildings/amsterdam-canal-house",
    "@playliquid/vehicles/tram",
    "@playliquid/environment/weather",
  ]);
  if (commit2.parentCommitId === commit1.id) { passed++; log(`  ✅ PASS: commit ${commit2.hash.slice(0, 12)} (parent linked)`); }
  else { failed++; log("  ❌ FAIL: commit chain"); }

  // ── 3. Create feature branch ────────────────────────────────
  log("\n── 3. Create feature branch ──");
  const feature = await git.createBranch(projectId, "feature/museum-district", "main");
  if (feature.name === "feature/museum-district" && feature.parentBranchId === main.id) { passed++; log("  ✅ PASS: feature branch created (forked from main)"); }
  else { failed++; log("  ❌ FAIL: feature branch"); }

  // ── 4. Commit to feature branch ─────────────────────────────
  log("\n── 4. Commit to feature branch ──");
  const featureCommit = await git.commit(projectId, "feature/museum-district", "bob", "Add museum package", [
    "@playliquid/buildings/amsterdam-canal-house",
    "@playliquid/vehicles/tram",
    "@playliquid/environment/weather",
    "@playliquid/buildings/museum",
  ]);
  if (featureCommit.hash) { passed++; log(`  ✅ PASS: feature commit ${featureCommit.hash.slice(0, 12)}`); }
  else { failed++; log("  ❌ FAIL: feature commit"); }

  // ── 5. Create PR ────────────────────────────────────────────
  log("\n── 5. Create PR (feature → main) ──");
  const pr = await git.createPR(projectId, "Add museum district", "New museum building package", "feature/museum-district", "main", "bob");
  if (pr.status === "OPEN" && pr.reviewStatus === "PENDING") { passed++; log(`  ✅ PASS: PR created (${pr.id.slice(-8)})`); }
  else { failed++; log("  ❌ FAIL: PR creation"); }

  // ── 6. Review + approve ─────────────────────────────────────
  log("\n── 6. Review + approve PR ──");
  const reviewed = await git.reviewPR(pr.id, "alice", "APPROVED");
  if (reviewed.reviewStatus === "APPROVED" && reviewed.reviewerName === "alice") { passed++; log("  ✅ PASS: PR approved"); }
  else { failed++; log("  ❌ FAIL: PR review"); }

  // ── 7. Merge ────────────────────────────────────────────────
  log("\n── 7. Merge PR ──");
  const merged = await git.mergePR(pr.id, "alice");
  if (merged.status === "MERGED" && merged.mergedAt) { passed++; log("  ✅ PASS: PR merged (main fast-forwarded)"); }
  else { failed++; log("  ❌ FAIL: PR merge"); }

  // Verify main's HEAD now points to the feature commit (fast-forward).
  // In git, a fast-forward merge moves the branch pointer — it doesn't
  // copy commits. So main's headCommitId should now equal the feature
  // branch's head commit.
  const mainBranch = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId: projectId, name: "main" } },
  });
  const featureBranch = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId: projectId, name: "feature/museum-district" } },
  });
  if (mainBranch?.headCommitId === featureBranch?.headCommitId && mainBranch?.headCommitId) { passed++; log("  ✅ PASS: main HEAD fast-forwarded to feature commit"); }
  else { failed++; log("  ❌ FAIL: main HEAD not advanced"); }

  // ── 8. Compose build from main ──────────────────────────────
  log("\n── 8. Compose build from main ──");
  const build1 = await pipeline.composeBuild(projectId, "main");
  if (build1.hash && build1.commitHash && build1.manifestLock.commitHash) { passed++; log(`  ✅ PASS: build v${build1.version} composed (hash=${build1.hash.slice(0, 12)})`); }
  else { failed++; log("  ❌ FAIL: compose build"); }

  // ── 9. Deploy build ─────────────────────────────────────────
  log("\n── 9. Deploy build v" + build1.version + " ──");
  const deploy1 = await pipeline.deployBuild(build1.id);
  if (deploy1.deployed.status === "deployed") { passed++; log("  ✅ PASS: build deployed"); }
  else { failed++; log("  ❌ FAIL: deploy"); }

  // ── 10. Compose + deploy second build ───────────────────────
  log("\n── 10. Compose + deploy second build ──");
  // Commit something new first
  await git.commit(projectId, "main", "alice", "Add tram route update", [
    "@playliquid/buildings/amsterdam-canal-house",
    "@playliquid/vehicles/tram",
    "@playliquid/environment/weather",
    "@playliquid/buildings/museum",
    "@playliquid/vehicles/tram-route-v2",
  ]);
  const build2 = await pipeline.composeBuild(projectId, "main");
  const deploy2 = await pipeline.deployBuild(build2.id);
  if (deploy2.deployed.status === "deployed" && deploy2.previousId === build1.id) { passed++; log(`  ✅ PASS: build v${build2.version} deployed (previous v${build1.version} available for rollback)`); }
  else { failed++; log("  ❌ FAIL: second deploy"); }

  // Verify build1 is no longer deployed
  const build1After = await pipeline.listBuilds(projectId);
  const b1 = build1After.find((b) => b.id === build1.id);
  if (b1 && b1.status === "ready") { passed++; log("  ✅ PASS: previous build marked ready (rollback target)"); }
  else { failed++; log("  ❌ FAIL: previous build status"); }

  // ── 11. Rollback to build1 ──────────────────────────────────
  log("\n── 11. Rollback to build v" + build1.version + " ──");
  const rollback = await pipeline.rollbackBuild(build1.id);
  if (rollback.deployed.status === "deployed" && rollback.rolledBackFromId === build2.id) { passed++; log(`  ✅ PASS: rolled back to v${build1.version} (from v${build2.version})`); }
  else { failed++; log("  ❌ FAIL: rollback"); }

  // Verify build2 is now ready (not deployed)
  const build2After = await pipeline.listBuilds(projectId);
  const b2 = build2After.find((b) => b.id === build2.id);
  if (b2 && b2.status === "ready") { passed++; log("  ✅ PASS: rolled-back-from build is now ready"); }
  else { failed++; log("  ❌ FAIL: post-rollback status"); }

  // ── 12. Verify reproducibility ──────────────────────────────
  log("\n── 12. Verify reproducibility (same lock → same hash) ──");
  const repro = await pipeline.verifyReproducible(build1.id);
  if (repro.reproducible) { passed++; log(`  ✅ PASS: build is reproducible (hash=${repro.lockHash.slice(0, 12)})`); }
  else { failed++; log(`  ❌ FAIL: not reproducible (lock=${repro.lockHash.slice(0, 8)}, expected=${repro.expectedHash.slice(0, 8)})`); }

  // ── Summary ──────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  World Projects are Git: branches, commits, PRs, builds.  ║");
    log("║  Immutable + reproducible + deployable + rollbackable.    ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");

  // Cleanup test branches/commits/PRs/builds (keep main + existing builds)
  await db.pullRequest.deleteMany({ where: { worldProjectId: projectId, contributorName: "bob" } });
  await db.worldCommit.deleteMany({ where: { worldProjectId: projectId, authorName: { in: ["alice", "bob"] } } });
  await db.worldBranch.deleteMany({ where: { worldProjectId: projectId, name: "feature/museum-district" } });
  // Reset any test-deployed builds to their original status
  await db.worldBuild.updateMany({ where: { worldProjectId: projectId, status: "deployed" }, data: { status: "ready" } });

  await db.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
