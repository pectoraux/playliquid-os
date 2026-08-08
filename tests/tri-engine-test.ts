// ════════════════════════════════════════════════════════════════
// PLAYLIQUID TRI-ENGINE ACCEPTANCE TEST (Phase K — Mobile adapter)
// ════════════════════════════════════════════════════════════════
//
// The reviewer's directive:
//   "The architecture should remain:
//        PlayLiquid OS
//           │
//        PlayLiquid Protocol
//           │
//      ┌────┼─────┬──────┐
//      │    │     │      │
//     Web  Mobile  Unity
//
//    The mistake to avoid is implementing: PlayLiquid Web OS,
//    PlayLiquid Mobile OS, PlayLiquid Unity OS. Instead there should
//    be ONE OS substrate and multiple runtime adapters."
//
// This test proves exactly that: ONE World Node (the OS substrate),
// THREE runtime adapters (Web, Unity, Mobile) all consuming the SAME
// protocol. When the Web client moves an avatar, all three engines
// see the same state update simultaneously.
//
// Test:
//   1. Start World Node
//   2. Start Unity adapter (connects to node)
//   3. Start Mobile adapter (connects to node)
//   4. Web client joins + moves avatar
//   5. Verify ALL THREE engines see the same avatar (ID + position + state + seq)
//   6. Web client mutates state
//   7. Verify ALL THREE engines see the same state mutation
//
// Run: bun run tests/tri-engine-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { spawn } from "child_process";
import { io, type Socket } from "socket.io-client";

const CONTROL_PLANE = process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3000";
const NODE_SCRIPT = new URL("../mini-services/world-node/index.ts", import.meta.url).pathname;
const UNITY_SCRIPT = new URL("../mini-services/unity-adapter/index.ts", import.meta.url).pathname;
const MOBILE_SCRIPT = new URL("../mini-services/mobile-adapter/index.ts", import.meta.url).pathname;
const BUILD_ID = process.env.WORLD_BUILD_ID ?? "cmsiux3bq0001q0gp8wbq1mw8";

const NODE = { port: 3031, wsPort: 3032 };
const UNITY_PORT = 3051;
const MOBILE_PORT = 3061;

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
      if ((line.includes("World Node running") || line.includes("Adapter running")) && !started) {
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

// ── Web client ───────────────────────────────────────────────────
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
          if (msg.type === "state") {
            if ((this.avatarId && msg.entityId === this.avatarId) ||
                (!this.avatarId && typeof msg.entityId === "string" && msg.entityId.startsWith("avatar-"))) {
              this.lastSeenState = { position: msg.position, state: msg.state, seq: msg.seq };
              if (!this.avatarId && typeof msg.entityId === "string") {
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

async function getAdapterEntity(adapter: "unity" | "mobile", entityId: string): Promise<any | null> {
  const port = adapter === "unity" ? UNITY_PORT : MOBILE_PORT;
  const path = adapter === "unity" ? "/unity/state" : "/mobile/state";
  const state = await http("GET", `http://127.0.0.1:${port}${path}`);
  return state.entities.find((e: any) => e.entityId === entityId) ?? null;
}

// ── Test ─────────────────────────────────────────────────────────
async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  PlayLiquid Tri-Engine Acceptance Test (Mobile adapter)  ║");
  log("║  ONE OS substrate · THREE runtime adapters              ║");
  log("╚════════════════════════════════════════════════════════════╝");
  log(`  Control plane: ${CONTROL_PLANE}`);
  log(`  Build:         ${BUILD_ID}`);
  log("");

  await waitFor(`${CONTROL_PLANE}/api/conformance`, "control plane");
  await http("DELETE", `${CONTROL_PLANE}/api/runtime/${BUILD_ID}/events`);
  log("  Durable store purged.\n");

  // Start World Node
  log("── Step 1: Start World Node (the ONE OS substrate) ──");
  const nodeProc = await startProcess(NODE_SCRIPT, [
    "--build", BUILD_ID, "--port", String(NODE.port), "--ws-port", String(NODE.wsPort),
    "--control-plane", CONTROL_PLANE, "--persistence", "remote",
  ], "World Node");
  await waitFor(`http://127.0.0.1:${NODE.port}/health`, "node health");
  log(`  ✓ World Node running`);

  // Start Unity adapter
  log("\n── Step 2: Start Unity adapter ──");
  const unityProc = await startProcess(UNITY_SCRIPT, [
    "--build", BUILD_ID, "--node-ws-port", String(NODE.wsPort), "--node-http-port", String(NODE.port),
    "--control-plane", CONTROL_PLANE, "--port", String(UNITY_PORT),
  ], "Unity Adapter");
  await waitFor(`http://127.0.0.1:${UNITY_PORT}/unity/health`, "unity health");
  log(`  ✓ Unity adapter running`);

  // Start Mobile adapter
  log("\n── Step 3: Start Mobile adapter ──");
  const mobileProc = await startProcess(MOBILE_SCRIPT, [
    "--build", BUILD_ID, "--node-ws-port", String(NODE.wsPort), "--node-http-port", String(NODE.port),
    "--control-plane", CONTROL_PLANE, "--port", String(MOBILE_PORT),
  ], "Mobile Adapter");
  await waitFor(`http://127.0.0.1:${MOBILE_PORT}/mobile/health`, "mobile health");
  log(`  ✓ Mobile adapter running`);

  await new Promise((r) => setTimeout(r, 1500));

  // Web client joins
  log("\n── Step 4: Web client joins (spawns avatar) ──");
  const web = new WebClient();
  await web.connect(NODE.wsPort);
  await web.join("TriEngine-Avatar");
  log(`  ✓ Web sessionId: ${web.sessionId}`);
  log(`  ✓ Web avatarId: ${web.avatarId}`);

  await new Promise((r) => setTimeout(r, 1500));

  // Verify all three engines see the avatar
  log("\n── Step 5: Verify ALL THREE engines see the SAME avatar ──");
  let passed = 0, failed = 0;

  const webSees = !!web.lastSeenState;
  const unityEntity = await getAdapterEntity("unity", web.avatarId!);
  const mobileEntity = await getAdapterEntity("mobile", web.avatarId!);

  log(`  Web sees avatar:    ${webSees ? "YES" : "NO"}`);
  log(`  Unity sees avatar:  ${unityEntity ? "YES" : "NO"}`);
  log(`  Mobile sees avatar: ${mobileEntity ? "YES" : "NO"}`);

  if (webSees && unityEntity && mobileEntity) { passed++; log("  ✅ PASS: all three engines see the avatar"); }
  else { failed++; log("  ❌ FAIL: not all engines see the avatar"); }

  // Entity ID consistency
  const idConsistent = unityEntity?.entityId === web.avatarId && mobileEntity?.entityId === web.avatarId;
  log(`  Entity ID consistent across all three: ${idConsistent ? "YES" : "NO"}`);
  if (idConsistent) { passed++; log("  ✅ PASS: same entity ID in Web, Unity, and Mobile"); }
  else { failed++; log("  ❌ FAIL: entity ID inconsistent"); }

  // ── Move the avatar ──
  log("\n── Step 6: Web client moves avatar (+8 X, +3 Z) ──");
  const moveAck = await web.move(8, 3);
  log(`  Web move ack: ${JSON.stringify(moveAck)}`);
  await new Promise((r) => setTimeout(r, 1000));

  log("\n── Step 7: Verify ALL THREE engines see the same position ──");
  const unityAfter = await getAdapterEntity("unity", web.avatarId!);
  const mobileAfter = await getAdapterEntity("mobile", web.avatarId!);
  const webPos = web.lastSeenState?.position;
  const unityPos = unityAfter?.plPosition;
  const mobilePos = mobileAfter?.plPosition;

  log(`  Web PL pos:    ${webPos ? JSON.stringify(webPos) : "null"}`);
  log(`  Unity PL pos:  ${unityPos ? JSON.stringify(unityPos) : "null"}`);
  log(`  Mobile PL pos: ${mobilePos ? JSON.stringify(mobilePos) : "null"}`);

  const allPositionsMatch = webPos && unityPos && mobilePos &&
    Math.abs(webPos.x - unityPos.x) < 0.001 && Math.abs(webPos.z - unityPos.z) < 0.001 &&
    Math.abs(webPos.x - mobilePos.x) < 0.001 && Math.abs(webPos.z - mobilePos.z) < 0.001;
  if (allPositionsMatch) { passed++; log("  ✅ PASS: all three engines see the same PL position"); }
  else { failed++; log("  ❌ FAIL: positions differ across engines"); }

  // ── Mutate package state ──
  log("\n── Step 8: Web client mutates package state (score=99) ──");
  const mutateAck = await web.mutateState({ score: 99, engine: "tri-test" });
  log(`  Web mutate ack: ${JSON.stringify(mutateAck)}`);
  await new Promise((r) => setTimeout(r, 1000));

  log("\n── Step 9: Verify ALL THREE engines see the same state mutation ──");
  const unityState = await getAdapterEntity("unity", web.avatarId!);
  const mobileState = await getAdapterEntity("mobile", web.avatarId!);
  const webScore = web.lastSeenState?.state?.score;
  const unityScore = unityState?.state?.score;
  const mobileScore = mobileState?.state?.score;

  log(`  Web score:    ${webScore}`);
  log(`  Unity score:  ${unityScore}`);
  log(`  Mobile score: ${mobileScore}`);

  const allStateMatch = webScore === 99 && unityScore === 99 && mobileScore === 99;
  if (allStateMatch) { passed++; log("  ✅ PASS: all three engines see the same package state mutation"); }
  else { failed++; log("  ❌ FAIL: state mutation not visible in all engines"); }

  // ── Seq consistency ──
  log("\n── Step 10: Verify seq consistency across all three engines ──");
  const webSeq = web.lastSeenState?.seq;
  const unitySeq = unityState?.seq;
  const mobileSeq = mobileState?.seq;
  log(`  Web seq:    ${webSeq}`);
  log(`  Unity seq:  ${unitySeq}`);
  log(`  Mobile seq: ${mobileSeq}`);
  const seqConsistent = webSeq !== undefined && unitySeq !== undefined && mobileSeq !== undefined &&
    webSeq === unitySeq && webSeq === mobileSeq;
  if (seqConsistent) { passed++; log("  ✅ PASS: all three engines at the same seq"); }
  else { failed++; log("  ❌ FAIL: seq mismatch"); }

  // ── Mobile-specific: screen projection ──
  log("\n── Step 11: Verify mobile screen projection (PL→mobile coords) ──");
  const mobileScreen = mobileState?.screenPosition;
  const hasScreenProjection = mobileScreen && typeof mobileScreen.x === "number" && typeof mobileScreen.y === "number";
  log(`  Mobile screen pos: ${mobileScreen ? JSON.stringify(mobileScreen) : "null"}`);
  if (hasScreenProjection) { passed++; log("  ✅ PASS: mobile adapter projected PL position to screen coordinates"); }
  else { failed++; log("  ❌ FAIL: no screen projection"); }

  // ── Summary ────────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  ONE OS substrate. THREE runtime adapters.               ║");
    log("║  Web · Unity · Mobile — all consuming the same protocol. ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");

  web.disconnect();
  killProc(nodeProc); killProc(unityProc); killProc(mobileProc);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
