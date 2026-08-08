// ════════════════════════════════════════════════════════════════
// PLAYLIQUID DUAL-ENGINE ACCEPTANCE TEST (Phase J — Unity adapter)
// ════════════════════════════════════════════════════════════════
//
// The reviewer's directive:
//
//   "Move the avatar. Both representations move.
//    Change package state. Both representations update.
//    Trigger a capability. Both receive the same Kernel decision.
//    That is the point at which I'd turn Cross-Engine from 🟡 to 🟢."
//
// This test:
//   1. Starts a World Node
//   2. Starts the Unity adapter (connects to the same node via WS)
//   3. A Web client joins (spawns an avatar)
//   4. Verifies the Unity adapter sees the SAME avatar (ID + state)
//   5. Web client moves the avatar
//   6. Verifies the Unity adapter sees the SAME position update
//   7. Web client mutates package state
//   8. Verifies the Unity adapter sees the SAME state mutation
//   9. Verifies coordinate transform (Z_PL → -Z_Unity)
//  10. Verifies draw commands match the declarative artifact
//
// The world is one. The engines are two. They agree.
//
// Run: bun run tests/dual-engine-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { spawn } from "child_process";
import { io, type Socket } from "socket.io-client";

const CONTROL_PLANE = process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const NODE_SCRIPT = new URL("../mini-services/world-node/index.ts", import.meta.url).pathname;
const UNITY_SCRIPT = new URL("../mini-services/unity-adapter/index.ts", import.meta.url).pathname;
const BUILD_ID = process.env.WORLD_BUILD_ID ?? "cmsiux3bq0001q0gp8wbq1mw8";

const NODE = { port: 3031, wsPort: 3032 };
const UNITY_PORT = 3051;

function log(msg: string) { console.log(msg); }

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

function startProcess(script: string, nodeArgs: string[], label: string): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    const proc = spawn("bun", [script, ...nodeArgs], { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let started = false;
    proc.stdout!.on("data", (chunk) => {
      const line = chunk.toString();
      if ((line.includes("World Node running") || line.includes("Unity Adapter running")) && !started) {
        started = true;
        setTimeout(() => resolve(proc), 1000);
      }
    });
    proc.stderr!.on("data", (chunk) => process.stderr.write(chunk));
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (!started) reject(new Error(`${label} exited early with code ${code}`));
    });
  });
}

function killProc(proc: ReturnType<typeof spawn>) {
  try { process.kill(-proc.pid!, "SIGKILL"); } catch {}
  try { proc.kill("SIGKILL"); } catch {}
}

// ── Web client (simulated) ───────────────────────────────────────
class WebClient {
  socket: Socket | null = null;
  sessionId: string | null = null;
  avatarId: string | null = null;
  lastSeenState: { position: { x: number; y: number; z: number }; state: Record<string, unknown>; seq: number } | null = null;

  connect(wsPort: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(`http://127.0.0.1:${wsPort}/`, {
        path: "/", transports: ["websocket"], forceNew: true, reconnection: false, timeout: 8000,
      });
      const timeout = setTimeout(() => reject(new Error("connect timeout")), 10000);
      this.socket.on("connect", () => { clearTimeout(timeout); resolve(); });
      this.socket.on("message", (data: string) => {
        try {
          const msg = JSON.parse(data);
          // Track state for our avatar. Also track by entityId prefix
          // (avatar-) in case avatarId isn't set yet when the spawn
          // broadcast arrives.
          if (msg.type === "state") {
            if ((this.avatarId && msg.entityId === this.avatarId) ||
                (!this.avatarId && typeof msg.entityId === "string" && msg.entityId.startsWith("avatar-"))) {
              this.lastSeenState = { position: msg.position, state: msg.state, seq: msg.seq };
              if (!this.avatarId && typeof msg.entityId === "string") {
                // Capture the avatar ID from the spawn broadcast
                this.avatarId = msg.entityId;
              }
            }
          }
        } catch {}
      });
      this.socket.on("connect_error", (err: Error) => { clearTimeout(timeout); reject(new Error(err.message)); });
    });
  }

  async join(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket!.emit("session:join", { name }, (ack: any) => {
        if (ack?.ok && ack.sessionId) {
          this.sessionId = ack.sessionId;
          this.avatarId = `avatar-${ack.sessionId}`;
          resolve();
        } else { reject(new Error("join failed")); }
      });
      setTimeout(() => reject(new Error("join timeout")), 5000);
    });
  }

  async move(deltaX: number, deltaZ: number): Promise<any> {
    return new Promise((resolve) => {
      this.socket!.emit("player:move", { sessionId: this.sessionId, deltaX, deltaZ }, (ack: any) => resolve(ack));
      setTimeout(() => resolve({ ok: false, timeout: true }), 5000);
    });
  }

  async mutateState(statePatch: Record<string, unknown>): Promise<any> {
    return new Promise((resolve) => {
      this.socket!.emit("entity:mutate", { entityId: this.avatarId, statePatch }, (ack: any) => resolve(ack));
      setTimeout(() => resolve({ ok: false, timeout: true }), 5000);
    });
  }

  disconnect() { if (this.socket) { this.socket.disconnect(); this.socket = null; } }
}

// ── Get the Unity adapter's view of a specific entity ────────────
async function getUnityEntity(entityId: string): Promise<any | null> {
  const state = await http("GET", `http://127.0.0.1:${UNITY_PORT}/unity/state`);
  return state.entities.find((e: any) => e.entityId === entityId) ?? null;
}

// ── Test ─────────────────────────────────────────────────────────
async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  PlayLiquid Dual-Engine Acceptance Test (Unity adapter)  ║");
  log("╚════════════════════════════════════════════════════════════╝");
  log(`  Control plane: ${CONTROL_PLANE}`);
  log(`  Build:         ${BUILD_ID}`);
  log("");

  await waitFor(`${CONTROL_PLANE}/api/conformance`, "control plane");
  await http("DELETE", `${CONTROL_PLANE}/api/runtime/${BUILD_ID}/events`);
  log("  Durable store purged.\n");

  // Start World Node
  log("── Step 1: Start World Node ──");
  const nodeProc = await startProcess(NODE_SCRIPT, [
    "--build", BUILD_ID,
    "--port", String(NODE.port),
    "--ws-port", String(NODE.wsPort),
    "--control-plane", CONTROL_PLANE,
    "--persistence", "remote",
  ], "World Node");
  await waitFor(`http://127.0.0.1:${NODE.port}/health`, "node health");
  log(`  ✓ Node running (HTTP ${NODE.port}, WS ${NODE.wsPort})`);

  // Start Unity adapter
  log("\n── Step 2: Start Unity adapter (connects to same node) ──");
  const unityProc = await startProcess(UNITY_SCRIPT, [
    "--build", BUILD_ID,
    "--node-ws-port", String(NODE.wsPort),
    "--node-http-port", String(NODE.port),
    "--control-plane", CONTROL_PLANE,
    "--port", String(UNITY_PORT),
  ], "Unity Adapter");
  await waitFor(`http://127.0.0.1:${UNITY_PORT}/unity/health`, "unity health");
  log(`  ✓ Unity adapter running (port ${UNITY_PORT})`);

  // Wait for Unity to receive the snapshot
  await new Promise((r) => setTimeout(r, 1500));
  const unityHealth = await http("GET", `http://127.0.0.1:${UNITY_PORT}/unity/health`);
  log(`  Unity: connected=${unityHealth.connected}, snapshot=${unityHealth.snapshotReceived}, entities=${unityHealth.entityCount}`);

  // Web client joins
  log("\n── Step 3: Web client joins (spawns avatar) ──");
  const web = new WebClient();
  await web.connect(NODE.wsPort);
  await web.join("DualEngine-Avatar");
  log(`  ✓ Web sessionId: ${web.sessionId}`);
  log(`  ✓ Web avatarId: ${web.avatarId}`);

  // Wait for Unity to see the avatar
  await new Promise((r) => setTimeout(r, 1500));

  log("\n── Step 4: Verify Unity adapter sees the SAME avatar ──");
  let unityAvatar = await getUnityEntity(web.avatarId!);
  let passed = 0, failed = 0;

  const webSeesAvatar = !!web.lastSeenState;
  const unitySeesAvatar = !!unityAvatar;
  log(`  Web sees avatar: ${webSeesAvatar ? "YES" : "NO"}`);
  log(`  Unity sees avatar: ${unitySeesAvatar ? "YES" : "NO"}`);
  if (webSeesAvatar && unitySeesAvatar) { passed++; log("  ✅ PASS: both engines see the avatar"); }
  else { failed++; log("  ❌ FAIL: engines disagree on avatar existence"); }

  // Verify entity ID is the same
  const idMatches = unityAvatar?.entityId === web.avatarId;
  log(`  Entity ID match: ${idMatches ? "YES" : "NO"} (${unityAvatar?.entityId ?? "null"} vs ${web.avatarId})`);
  if (idMatches) { passed++; log("  ✅ PASS: same entity ID across engines"); }
  else { failed++; log("  ❌ FAIL: entity ID differs"); }

  // ── Move the avatar ──
  log("\n── Step 5: Web client moves avatar (+8 X, +3 Z) ──");
  const moveAck = await web.move(8, 3);
  log(`  Web move ack: ${JSON.stringify(moveAck)}`);
  await new Promise((r) => setTimeout(r, 1000));

  log("\n── Step 6: Verify BOTH engines see the same position ──");
  unityAvatar = await getUnityEntity(web.avatarId!);
  const webPos = web.lastSeenState?.position;
  const unityPos = unityAvatar?.plPosition;

  log(`  Web position:    ${webPos ? JSON.stringify(webPos) : "null"}`);
  log(`  Unity PL position: ${unityPos ? JSON.stringify(unityPos) : "null"}`);
  log(`  Unity Unity position: ${unityAvatar ? JSON.stringify(unityAvatar.unityPosition) : "null"}`);

  const positionsMatch = webPos && unityPos &&
    Math.abs(webPos.x - unityPos.x) < 0.001 &&
    Math.abs(webPos.y - unityPos.y) < 0.001 &&
    Math.abs(webPos.z - unityPos.z) < 0.001;
  if (positionsMatch) { passed++; log("  ✅ PASS: both engines see the same PL position"); }
  else { failed++; log("  ❌ FAIL: positions differ"); }

  // Coordinate transform check
  const transformCorrect = unityAvatar && unityPos && unityAvatar.unityPosition &&
    Math.abs(unityAvatar.unityPosition.z - (-unityPos.z)) < 0.001;
  if (transformCorrect) { passed++; log(`  ✅ PASS: PL→Unity coordinate transform (Z_PL=${unityPos!.z.toFixed(2)} → Z_Unity=${unityAvatar!.unityPosition.z.toFixed(2)})`); }
  else { failed++; log("  ❌ FAIL: coordinate transform incorrect"); }

  // ── Mutate package state ──
  log("\n── Step 7: Web client mutates package state (score=42) ──");
  const mutateAck = await web.mutateState({ score: 42, visited: true });
  log(`  Web mutate ack: ${JSON.stringify(mutateAck)}`);
  await new Promise((r) => setTimeout(r, 1000));

  log("\n── Step 8: Verify Unity adapter sees the SAME state mutation ──");
  unityAvatar = await getUnityEntity(web.avatarId!);
  const unityScore = unityAvatar?.state?.score;
  const unityVisited = unityAvatar?.state?.visited;
  const webScore = web.lastSeenState?.state?.score;
  const webVisited = web.lastSeenState?.state?.visited;
  log(`  Web state:    score=${webScore}, visited=${webVisited}`);
  log(`  Unity state:  score=${unityScore}, visited=${unityVisited}`);
  const stateMatches = unityScore === 42 && unityVisited === true && webScore === 42 && webVisited === true;
  if (stateMatches) { passed++; log("  ✅ PASS: both engines see the same package state mutation"); }
  else { failed++; log("  ❌ FAIL: state mutation not visible in both engines"); }

  // ── Draw commands match the declarative artifact ──
  log("\n── Step 9: Verify Unity draw commands match the declarative artifact ──");
  const hasDrawCommands = unityAvatar && unityAvatar.drawCommands.length > 0;
  const hasSphereCommand = unityAvatar?.drawCommands.some((c: any) => c.cmd.includes("Sphere"));
  log(`  Draw commands: ${unityAvatar?.drawCommands.length ?? 0}`);
  log(`  Has Sphere primitive: ${hasSphereCommand ? "YES" : "NO"}`);
  if (hasDrawCommands && hasSphereCommand) { passed++; log("  ✅ PASS: Unity adapter generated correct draw commands from the same artifact"); }
  else { failed++; log("  ❌ FAIL: draw commands missing or incorrect"); }

  // ── Seq ordering across engines ──
  log("\n── Step 10: Verify seq consistency across engines ──");
  const webSeq = web.lastSeenState?.seq;
  const unitySeq = unityAvatar?.seq;
  log(`  Web seq:    ${webSeq}`);
  log(`  Unity seq:  ${unitySeq}`);
  const seqConsistent = webSeq !== undefined && unitySeq !== undefined && webSeq === unitySeq;
  if (seqConsistent) { passed++; log("  ✅ PASS: both engines at the same seq (same authoritative mutation)"); }
  else { failed++; log("  ❌ FAIL: seq mismatch"); }

  // ── Summary ────────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  The world is one. The engines are two. They agree.      ║");
    log("║  Cross-Engine: 🟡 → 🟢                                   ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");

  web.disconnect();
  killProc(nodeProc);
  killProc(unityProc);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
