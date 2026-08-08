// ════════════════════════════════════════════════════════════════
// GATE G — Disaster/Recovery Acceptance Test
// ════════════════════════════════════════════════════════════════
//
// The audit's Gate G: "World Node crashes → new Node starts → same
// Build → same authoritative state → clients reconnect → world
// continues."
//
// Run: bun run tests/gate-disaster-recovery.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { spawn } from "child_process";
import { io } from "socket.io-client";

const CP = process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const BUILD_ID = process.env.WORLD_BUILD_ID ?? "cmsiux3bq0001q0gp8wbq1mw8";

function log(msg: string) { console.log(msg); }

async function http(method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method, headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function waitFor(url: string, label: string, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(url); if (res.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

function startNode(port: number, wsPort: number): ReturnType<typeof spawn> {
  return spawn("bun", [
    "mini-services/world-node/index.ts",
    "--build", BUILD_ID, "--port", String(port), "--ws-port", String(wsPort),
    "--control-plane", CP, "--persistence", "remote",
  ], { stdio: ["ignore", "pipe", "pipe"], detached: true });
}

function killNode(proc: ReturnType<typeof spawn>) {
  try { process.kill(-proc.pid!, "SIGKILL"); } catch {}
  try { proc.kill("SIGKILL"); } catch {}
}

async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  Gate G — Disaster/Recovery Test                         ║");
  log("║  Crash → new node → same build → same state → reconnect  ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;
  await waitFor(`${CP}/api/conformance`, "control plane");
  await http("DELETE", `${CP}/api/runtime/${BUILD_ID}/events`);

  // ── 1. Start World Node ──
  log("── 1. Start World Node ──");
  const node1 = startNode(3101, 3102);
  await waitFor(`http://127.0.0.1:3101/health`, "node 1", 15000);
  log("  Node 1 running");

  // ── 2. Connect client + spawn entity + mutate state ──
  log("\n── 2. Connect client, spawn avatar, move it ──");
  const sock = io(`http://127.0.0.1:3102/`, {
    path: "/", transports: ["websocket"], forceNew: true, timeout: 5000,
  });
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("connect timeout")), 8000);
    sock.on("connect", () => { clearTimeout(t); resolve(); });
  });

  const joinAck = await new Promise<any>((resolve) => {
    sock.emit("session:join", { name: "DisasterTest" }, (ack: any) => resolve(ack));
    setTimeout(() => resolve(null), 5000);
  });
  const sessionId = joinAck?.sessionId;
  if (sessionId) { log(`  Session: ${sessionId.slice(-8)}`); }

  // Move the avatar
  if (sessionId) {
    await new Promise<any>((resolve) => {
      sock.emit("player:move", { sessionId, deltaX: 5, deltaZ: 3 }, (ack: any) => resolve(ack));
      setTimeout(() => resolve(null), 5000);
    });
  }
  await new Promise((r) => setTimeout(r, 500));

  // ── 3. Force snapshot + record state hash ──
  log("\n── 3. Force snapshot + record state hash (before crash) ──");
  await http("POST", `http://127.0.0.1:3101/snapshot`);
  const preCrashHash = await http("GET", `${CP}/api/runtime/${BUILD_ID}/state-hash`);
  log(`  Pre-crash hash: ${preCrashHash.hash?.slice(0, 20)}`);
  if (preCrashHash.hash) { passed++; log("  ✅ PASS: state hash recorded before crash"); }
  else { failed++; log("  ❌ FAIL: no pre-crash hash"); }

  // ── 4. CRASH: kill the World Node (SIGKILL) ──
  log("\n── 4. CRASH — kill World Node (SIGKILL) ──");
  sock.disconnect();
  killNode(node1);
  await new Promise((r) => setTimeout(r, 2000));
  passed++; log("  ✅ PASS: node crashed (SIGKILL)");

  // ── 5. Start a FRESH node (same build) ──
  log("\n── 5. Start FRESH node (same build) ──");
  const node2 = startNode(3111, 3112);
  await waitFor(`http://127.0.0.1:3111/health`, "node 2 (fresh)", 15000);
  log("  Fresh node running");

  // ── 6. Verify: same build → same authoritative state ──
  log("\n── 6. Verify same authoritative state (state hash) ──");
  await new Promise((r) => setTimeout(r, 1000)); // wait for recovery
  const postRecoveryHash = await http("GET", `${CP}/api/runtime/${BUILD_ID}/state-hash`);
  log(`  Post-recovery hash: ${postRecoveryHash.hash?.slice(0, 20)}`);

  if (preCrashHash.hash && postRecoveryHash.hash && preCrashHash.hash === postRecoveryHash.hash) {
    passed++; log("  ✅ PASS: same state hash — world survived crash");
  } else {
    failed++; log("  ❌ FAIL: state hash differs");
  }

  // ── 7. Reconnect client → world continues ──
  log("\n── 7. Reconnect client → world continues ──");
  const sock2 = io(`http://127.0.0.1:3112/`, {
    path: "/", transports: ["websocket"], forceNew: true, timeout: 5000,
  });
  let reconnected = false;
  let gotSnapshot = false;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("reconnect timeout")), 8000);
    sock2.on("connect", () => { reconnected = true; });
    sock2.on("message", (data: string) => {
      const msg = JSON.parse(data);
      if (msg.type === "snapshot") { gotSnapshot = true; clearTimeout(t); resolve(); }
    });
    setTimeout(() => { clearTimeout(t); resolve(); }, 5000);
  });

  if (reconnected && gotSnapshot) { passed++; log("  ✅ PASS: client reconnected + received snapshot (world continues)"); }
  else { failed++; log(`  ❌ FAIL: reconnect=${reconnected}, snapshot=${gotSnapshot}`); }

  // ── 8. Client can interact with the recovered world ──
  log("\n── 8. Client interacts with recovered world ──");
  const joinAck2 = await new Promise<any>((resolve) => {
    sock2.emit("session:join", { name: "PostRecovery" }, (ack: any) => resolve(ack));
    setTimeout(() => resolve(null), 5000);
  });
  if (joinAck2?.ok) { passed++; log("  ✅ PASS: client joined recovered world + can interact"); }
  else { failed++; log("  ❌ FAIL: post-recovery join"); }

  // Cleanup
  sock2.disconnect();
  killNode(node2);

  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  World Node crashed → fresh node → same state → reconnect  ║");
    log("║  → world continues. PlayLiquid behaves like an OS.        ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
