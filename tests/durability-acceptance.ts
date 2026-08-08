// ════════════════════════════════════════════════════════════════
// PLAYLIQUID DURABILITY ACCEPTANCE TEST
// ════════════════════════════════════════════════════════════════
//
// Phase G.1 — the definitive proof that persistence belongs to the OS,
// not to the machine the World Node happened to run on.
//
// This script performs the EXACT acceptance test from the reviewer's
// directive:
//
//   1. Start World Node
//   2. Load immutable Build #N
//   3. Connect clients (spawn avatar)
//   4. Move them
//   5. Mutate package state
//   6. Force snapshot
//   7. Record canonical state hash
//   8. Kill -9 node
//   9. Destroy node-local storage (/tmp)
//  10. Start a fresh node (clean machine)
//  11. Point it at durable persistence
//  12. Recover
//  13. Compute state hash
//  14. Assert hash == pre-crash hash
//
// It tests BOTH recovery paths:
//   A. Snapshot-only recovery (0 post-snapshot events)
//   B. Snapshot + event replay (mutations after the snapshot, killed
//      with -9 so no graceful final snapshot — the replay path must
//      reconstruct the missing state)
//
// Run:
//   bun run tests/durability-acceptance.ts
//
// Prerequisites:
//   - The control plane (Next.js) must be running on CONTROL_PLANE
//     (default http://127.0.0.1:3000)
//   - A composed WorldBuild must exist (auto-detected if not given)
//
// Exit code 0 = PASS, non-zero = FAIL.

import { spawn } from "child_process";
import { existsSync, rmSync, readdirSync } from "fs";

const CONTROL_PLANE = process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const NODE_PORT = parseInt(process.env.WORLD_NODE_PORT ?? "3051", 10);
const NODE_SCRIPT = new URL("../mini-services/world-node/index.ts", import.meta.url).pathname;
const PERSISTENCE_MODE = "remote";

// ── Helpers ──────────────────────────────────────────────────────

function log(msg: string) {
  console.log(msg);
}

async function http(method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { _raw: text, status: res.status }; }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${method} ${url}: ${text}`);
  return json;
}

async function waitFor(url: string, label: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${label} at ${url}`);
}

let nodeProc: ReturnType<typeof spawn> | null = null;

function startNode(buildId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    nodeProc = spawn("bun", [
      NODE_SCRIPT,
      "--build", buildId,
      "--port", String(NODE_PORT),
      "--control-plane", CONTROL_PLANE,
      "--persistence", PERSISTENCE_MODE,
    ], { stdio: ["ignore", "pipe", "pipe"], detached: true });

    let started = false;
    nodeProc.stdout!.on("data", (chunk) => {
      const line = chunk.toString();
      if (line.includes("World Node running") && !started) {
        started = true;
        resolve();
      }
    });
    nodeProc.stderr!.on("data", (chunk) => process.stderr.write(chunk));
    nodeProc.on("error", reject);
    nodeProc.on("exit", (code) => {
      if (!started) reject(new Error(`Node exited early with code ${code}`));
    });
  });
}

function killNodeHard() {
  if (nodeProc) {
    try { process.kill(-nodeProc.pid!, "SIGKILL"); } catch {}
    try { nodeProc.kill("SIGKILL"); } catch {}
    nodeProc = null;
  }
}

function destroyTmpStorage() {
  // Destroy ANY node-local playliquid persistence files. In remote mode
  // there should be none for the test build — but we destroy them all to
  // prove the recovery does not depend on the local filesystem.
  const tmpFiles = readdirSync("/tmp").filter((f) => f.startsWith("playliquid-"));
  for (const f of tmpFiles) {
    try { rmSync(`/tmp/${f}`, { recursive: true, force: true }); } catch {}
  }
  return tmpFiles.length;
}

async function getStateHash(): Promise<{ hash: string; seq: number; entities: number }> {
  const d = await http("GET", `${CONTROL_PLANE}/api/runtime/${BUILD_ID}/state-hash`);
  return { hash: d.hash, seq: d.buildSeq, entities: d.entityCount };
}

let BUILD_ID = "";

// ── Test ─────────────────────────────────────────────────────────

async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  PlayLiquid Durability Acceptance Test (Phase G.1)        ║");
  log("╚════════════════════════════════════════════════════════════╝");
  log(`  Control plane: ${CONTROL_PLANE}`);
  log(`  Node port:     ${NODE_PORT}`);
  log(`  Persistence:   ${PERSISTENCE_MODE}`);
  log("");

  // ── 0. Find a composed build + verify control plane ───────────
  log("── Step 0: Verify control plane + find a build ──");
  await waitFor(`${CONTROL_PLANE}/api/conformance`, "control plane");
  // Try the env-provided build, else pick the first composed build via scene.
  BUILD_ID = process.env.WORLD_BUILD_ID ?? "";
  if (!BUILD_ID) {
    // Use the known composed build from seed; probe the state-hash endpoint
    // for a few candidate builds isn't reliable, so we ask the world-builds API.
    try {
      const builds = await http("GET", `${CONTROL_PLANE}/api/world-builds`);
      const composed = (builds.builds ?? builds).find((b: any) => b.status === "composed" || b.status === "ready");
      BUILD_ID = composed?.id;
    } catch {}
  }
  if (!BUILD_ID) throw new Error("No WORLD_BUILD_ID given and no composed build found");
  log(`  Build: ${BUILD_ID}`);

  // Purge any prior durable state for a clean slate.
  await http("DELETE", `${CONTROL_PLANE}/api/runtime/${BUILD_ID}/events`);
  log("  Durable store purged (clean slate).");
  log("");

  let passed = 0;
  let failed = 0;

  // ════════════════════════════════════════════════════════════════
  // PATH A: Snapshot-only recovery
  // ════════════════════════════════════════════════════════════════
  log("═══ PATH A: Snapshot-only recovery ═══");
  log("── Step 1: Start World Node ──");
  await startNode(BUILD_ID);
  await waitFor(`http://127.0.0.1:${NODE_PORT}/health`, "node health");

  log("── Step 2-3: Verify build loaded + spawn avatar ──");
  const health = await http("GET", `http://127.0.0.1:${NODE_PORT}/health`);
  log(`  Loaded: ${health.entityCount} entities, persistence=${health.capabilities.persistence}`);
  if (health.capabilities.persistence !== "remote") {
    log("  ❌ FAIL: node is not using remote persistence");
    failed++; killNodeHard(); throw new Error("not remote");
  }

  const session = await http("POST", `http://127.0.0.1:${NODE_PORT}/session`, { action: "join", name: "Alice" });
  log(`  Session: ${session.sessionId}`);

  log("── Step 4-5: Move + mutate ──");
  for (let i = 1; i <= 3; i++) {
    await http("POST", `http://127.0.0.1:${NODE_PORT}/move-player`, { sessionId: session.sessionId, deltaX: i, deltaZ: i * 2 });
  }
  log("  Moved 3x");

  log("── Step 6: Force snapshot ──");
  const snap = await http("POST", `http://127.0.0.1:${NODE_PORT}/snapshot`);
  log(`  Snapshot: seq=${snap.seq}, entities=${snap.entities}`);

  log("── Step 7: Record canonical state hash (pre-crash) ──");
  const preA = await getStateHash();
  log(`  PRE-CRASH hash: ${preA.hash} (seq=${preA.seq}, entities=${preA.entities})`);

  log("── Step 8: Kill -9 node ──");
  killNodeHard();
  await new Promise((r) => setTimeout(r, 1500));
  log("  Node killed with SIGKILL");

  log("── Step 9: Destroy node-local storage (/tmp) ──");
  const destroyed = destroyTmpStorage();
  log(`  Destroyed ${destroyed} /tmp playliquid file(s)`);

  log("── Step 10-11: Start FRESH node on clean machine (remote persistence) ──");
  await startNode(BUILD_ID);
  await waitFor(`http://127.0.0.1:${NODE_PORT}/health`, "fresh node health");

  log("── Step 12-13: Compute post-recovery state hash ──");
  const postA = await getStateHash();
  log(`  POST-RECOVERY hash: ${postA.hash} (seq=${postA.seq}, entities=${postA.entities})`);

  log("── Step 14: ASSERT hash equality ──");
  if (preA.hash === postA.hash) {
    log("  ✅ PATH A PASSED — world survived kill -9 + /tmp destruction");
    passed++;
  } else {
    log(`  ❌ PATH A FAILED — pre=${preA.hash} post=${postA.hash}`);
    failed++;
  }
  log("");

  // ════════════════════════════════════════════════════════════════
  // PATH B: Snapshot + event replay (killed mid-flight, no graceful snap)
  // ════════════════════════════════════════════════════════════════
  log("═══ PATH B: Snapshot + event replay (no graceful shutdown) ═══");
  // The node from Path A is still running with recovered state.
  log("── Step B1: Spawn a SECOND avatar (Bob) ──");
  const session2 = await http("POST", `http://127.0.0.1:${NODE_PORT}/session`, { action: "join", name: "Bob" });
  log(`  Session: ${session2.sessionId}`);

  log("── Step B2: Move Bob 4x (creates post-snapshot events) ──");
  for (let i = 1; i <= 4; i++) {
    await http("POST", `http://127.0.0.1:${NODE_PORT}/move-player`, { sessionId: session2.sessionId, deltaX: i, deltaZ: 1 });
  }
  log("  Moved 4x (9 post-snapshot events: spawn + 4×pos + 4×dir)");

  log("── Step B3: Record pre-crash hash (with unreplayed events) ──");
  const preB = await getStateHash();
  log(`  PRE-CRASH hash: ${preB.hash} (seq=${preB.seq}, entities=${preB.entities})`);

  log("── Step B4: Kill -9 (NO graceful snapshot — replay path required) ──");
  killNodeHard();
  await new Promise((r) => setTimeout(r, 1500));
  log("  Node killed with SIGKILL (no SIGTERM handler ran)");

  log("── Step B5: Destroy /tmp again ──");
  destroyTmpStorage();

  log("── Step B6: Start fresh node, recover via snapshot + replay ──");
  await startNode(BUILD_ID);
  await waitFor(`http://127.0.0.1:${NODE_PORT}/health`, "fresh node health (B)");

  log("── Step B7: Compute post-recovery hash ──");
  const postB = await getStateHash();
  log(`  POST-RECOVERY hash: ${postB.hash} (seq=${postB.seq}, entities=${postB.entities})`);

  log("── Step B8: ASSERT hash equality (replay reconstructed exact state) ──");
  if (preB.hash === postB.hash) {
    log("  ✅ PATH B PASSED — snapshot + event replay reconstructed exact state");
    passed++;
  } else {
    log(`  ❌ PATH B FAILED — pre=${preB.hash} post=${postB.hash}`);
    failed++;
  }

  killNodeHard();

  // ── Summary ───────────────────────────────────────────────────
  log("");
  log("╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  Persistence belongs to the OS, not the machine.          ║");
    log("╚════════════════════════════════════════════════════════════╝");
    process.exit(0);
  } else {
    log("╚════════════════════════════════════════════════════════════╝");
    process.exit(1);
  }
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  killNodeHard();
  process.exit(1);
});
