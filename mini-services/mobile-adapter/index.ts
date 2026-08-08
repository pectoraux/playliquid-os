// ════════════════════════════════════════════════════════════════
// PLAYLIQUID MOBILE ADAPTER — Thin Native Client
// ════════════════════════════════════════════════════════════════
//
// Phase K: A standalone process that simulates a thin native mobile
// client (iOS/Android) consuming the SAME PlayLiquid protocol as the
// Web and Unity runtimes.
//
// The reviewer's key directive:
//   "The mistake to avoid is implementing: PlayLiquid Web OS,
//    PlayLiquid Mobile OS, PlayLiquid Unity OS. Instead there should
//    be ONE OS substrate and multiple runtime adapters."
//
// This adapter does NOT re-implement multiplayer, persistence,
// identity, or state authority. It connects to the SAME World Node,
// consumes the SAME Scene API + declarative artifacts, and renders
// through a mobile-appropriate lens:
//   - Touch input model (tap-to-move, pinch-zoom)
//   - Device viewport constraints (phone screen aspect ratio)
//   - Mobile 2.5D top-down rendering (suitable for small screens)
//   - Battery/performance-aware (simplified draw calls)
//
// The same world. The same protocol. A different rendering surface.
//
// Usage:
//   bun run index.ts --build <buildId> --node-ws-port 3002 \
//     --node-http-port 3001 --control-plane http://localhost:3000 \
//     --port 3061

import { createServer } from "http";
import { io } from "socket.io-client";

// ── Parse args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const buildId = args[args.indexOf("--build") + 1] ?? process.env.WORLD_BUILD_ID;
const nodeWsPort = parseInt(args[args.indexOf("--node-ws-port") + 1] ?? "3002");
const nodeHttpPort = parseInt(args[args.indexOf("--node-http-port") + 1] ?? "3001");
const controlPlane = args[args.indexOf("--control-plane") + 1] ?? "http://localhost:3000";
const port = parseInt(args[args.indexOf("--port") + 1] ?? "3061");

if (!buildId) {
  console.error("Usage: bun run index.ts --build <buildId> [--node-ws-port 3002] [--node-http-port 3001] [--control-plane http://localhost:3000] [--port 3061]");
  process.exit(1);
}

console.log(`╔══════════════════════════════════════════════════╗`);
console.log(`║  PlayLiquid Mobile Adapter                       ║`);
console.log(`║  Build: ${buildId.slice(0, 20)}                    ║`);
console.log(`║  Node WS:  ${nodeWsPort}                          ║`);
console.log(`║  Adapter:  ${port}                               ║`);
console.log(`╚══════════════════════════════════════════════════╝`);

// ── Mobile viewport model ────────────────────────────────────────
// A phone screen: portrait, ~9:16 aspect ratio. The mobile adapter
// renders a top-down 2.5D view (suitable for small screens) rather
// than the full 3D perspective the Web runtime uses.
const MOBILE_VIEWPORT = { width: 390, height: 844, dpr: 3 }; // iPhone 14
const MOBILE_VIEW = { type: "top-down-2.5d", zoom: 1.0, center: { x: 0, z: 0 } };

// ── Mobile entity model ──────────────────────────────────────────
interface MobileEntity {
  entityId: string;
  name: string;
  // PL position (authoritative, from the World Node)
  plPosition: { x: number; y: number; z: number };
  // Mobile screen position (projected to the 2.5D top-down view)
  screenPosition: { x: number; y: number };
  state: Record<string, unknown>;
  seq: number;
  // Mobile-simplified render descriptor (what the mobile UI would draw)
  renderDescriptor: {
    type: string; // "circle" | "rect" | "diamond" | "icon"
    size: number;
    color: string;
    label: string;
  };
  lastUpdated: number;
}

const mobileEntities = new Map<string, MobileEntity>();
let connected = false;
let snapshotReceived = false;
const startedAt = Date.now();
let lastUpdateSeq = 0;
let totalMessagesReceived = 0;

// ── Project PL world coords → mobile screen coords ───────────────
// Top-down 2.5D: X_PL → screen X, Z_PL → screen Y (flipped so north
// is up). Centered on the view center, scaled by zoom.
function plToMobileScreen(
  plPos: { x: number; y: number; z: number },
  viewCenter: { x: number; z: number },
  zoom: number
): { x: number; y: number } {
  const screenX = MOBILE_VIEWPORT.width / 2 + (plPos.x - viewCenter.x) * zoom * 8;
  const screenY = MOBILE_VIEWPORT.height / 2 - (plPos.z - viewCenter.z) * zoom * 8; // flip Z (north = up)
  return { x: screenX, y: screenY };
}

// ── Interpret declarative artifact → mobile render descriptor ────
// Mobile uses simplified shapes (circle/rect/diamond/icon) suitable
// for small screens and touch interaction. The SAME artifact that
// produces a 3D sphere in Web and a Unity PrimitiveType.Sphere here
// becomes a mobile "circle" — same entity, screen-appropriate render.
function interpretArtifactForMobile(
  artifact: Record<string, unknown> | null,
  state: Record<string, unknown>
): MobileEntity["renderDescriptor"] {
  if (!artifact) {
    return { type: "icon", size: 16, color: "#6b7280", label: String(state.name ?? "?") };
  }
  const render = artifact.render as { params?: Record<string, unknown> } | undefined;
  const shape = (render?.params?.shape as string) ?? "sphere";
  const size = ((render?.params?.size as number) ?? 1) * 8;
  const color = (render?.params?.color as string) ?? "#22d3ee";
  const label = String(state.name ?? "");

  let type = "circle";
  if (shape === "box") type = "rect";
  else if (shape === "diamond") type = "diamond";
  else if (shape === "sphere") type = "circle";
  else if (shape === "cylinder" || shape === "cone") type = "circle";

  return { type, size, color, label };
}

function parseArtifact(state: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof state.declarativeArtifact === "string") {
    try { return JSON.parse(state.declarativeArtifact); } catch { return null; }
  }
  return null;
}

// ── Connect to the World Node via WebSocket (same protocol) ──────
const nodeWsUrl = `http://127.0.0.1:${nodeWsPort}/`;
console.log(`  Connecting to World Node WS: ${nodeWsUrl}`);

const socket = io(nodeWsUrl, {
  path: "/",
  transports: ["websocket"],
  forceNew: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  timeout: 8000,
});

socket.on("connect", () => {
  connected = true;
  console.log(`  ✓ Connected to World Node (socket ${socket.id})`);
  // The mobile adapter does NOT join a session by default — it observes.
  // A real mobile app would join (spawn avatar) on user action.
});

socket.on("disconnect", () => {
  connected = false;
  console.log(`  ✗ Disconnected from World Node`);
});

socket.on("message", (data: string) => {
  totalMessagesReceived++;
  try {
    const msg = JSON.parse(data);
    if (msg.type === "snapshot") {
      snapshotReceived = true;
      mobileEntities.clear();
      for (const e of (msg.entities as Array<{
        entityId: string;
        position: { x: number; y: number; z: number };
        state: Record<string, unknown>;
      }>)) {
        const artifact = parseArtifact(e.state);
        const screenPos = plToMobileScreen(e.position, MOBILE_VIEW.center, MOBILE_VIEW.zoom);
        const renderDescriptor = interpretArtifactForMobile(artifact, e.state);
        mobileEntities.set(e.entityId, {
          entityId: e.entityId,
          name: (e.state.name as string) ?? e.entityId,
          plPosition: e.position,
          screenPosition: screenPos,
          state: e.state,
          seq: 0,
          renderDescriptor,
          lastUpdated: Date.now(),
        });
      }
      lastUpdateSeq = msg.buildSeq ?? lastUpdateSeq;
      console.log(`  Snapshot: ${mobileEntities.size} entities (buildSeq=${lastUpdateSeq})`);
    } else if (msg.type === "state") {
      const existing = mobileEntities.get(msg.entityId);
      const plPos = msg.position as { x: number; y: number; z: number };
      const state = msg.state as Record<string, unknown>;
      const artifact = existing ? parseArtifact(existing.state) : parseArtifact(state);
      const screenPos = plToMobileScreen(plPos, MOBILE_VIEW.center, MOBILE_VIEW.zoom);
      const renderDescriptor = interpretArtifactForMobile(artifact, state);
      mobileEntities.set(msg.entityId, {
        entityId: msg.entityId,
        name: (state.name as string) ?? existing?.name ?? msg.entityId,
        plPosition: plPos,
        screenPosition: screenPos,
        state,
        seq: msg.seq ?? 0,
        renderDescriptor,
        lastUpdated: Date.now(),
      });
      lastUpdateSeq = msg.buildSeq ?? lastUpdateSeq;
    } else if (msg.type === "event" && msg.event === "entity.remove") {
      mobileEntities.delete(msg.entityId);
    } else if (msg.type === "handoff") {
      console.log(`  Handoff event: entity ${msg.entityId} → zone ${msg.toZoneId}`);
    }
  } catch (e) {
    console.error("  Message parse error:", e);
  }
});

socket.on("connect_error", (err: Error) => {
  console.error(`  WS connect error: ${err.message}`);
});

// ── HTTP server: expose the mobile adapter's live view ───────────
const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${port}`);

  // ── Health ─────────────────────────────────────────────────────
  if (url.pathname === "/mobile/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      adapter: "playliquid-mobile",
      buildId,
      connected,
      snapshotReceived,
      entityCount: mobileEntities.size,
      lastUpdateSeq,
      totalMessagesReceived,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      viewport: MOBILE_VIEWPORT,
      view: MOBILE_VIEW,
      inputModel: "touch (tap-to-move, pinch-zoom)",
      protocol: "same-as-web-and-unity",
    }));
    return;
  }

  // ── Live mobile state ──────────────────────────────────────────
  if (url.pathname === "/mobile/state") {
    const entities = Array.from(mobileEntities.values()).map((e) => ({
      entityId: e.entityId,
      name: e.name,
      plPosition: e.plPosition,
      screenPosition: e.screenPosition,
      state: e.state,
      seq: e.seq,
      renderDescriptor: e.renderDescriptor,
      lastUpdated: e.lastUpdated,
    }));
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      adapter: "playliquid-mobile",
      buildId,
      connected,
      snapshotReceived,
      viewport: MOBILE_VIEWPORT,
      view: MOBILE_VIEW,
      lastUpdateSeq,
      entityCount: entities.length,
      entities,
    }));
    return;
  }

  // ── Compare with Web scene ─────────────────────────────────────
  if (url.pathname === "/mobile/compare") {
    Promise.all([
      fetch(`${controlPlane}/api/runtime/${buildId}/scene`).then((r) => r.json()).catch(() => null),
      Promise.resolve(Array.from(mobileEntities.values())),
    ]).then(([scene, mobileEnts]) => {
      const webEntities = (scene?.entities ?? []).map((e: { id: string; name: string }) => ({
        entityId: e.id,
        name: e.name,
      }));
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        buildId,
        webRuntime: { entities: webEntities.length },
        mobileAdapter: { entities: mobileEnts.length },
        sameEntityIds: webEntities.every((w: { entityId: string }) => mobileEnts.some((m) => m.entityId === w.entityId)),
      }));
    }).catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : "compare failed" }));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use /mobile/health, /mobile/state, or /mobile/compare" }));
});

server.listen(port, () => {
  console.log(`\n✓ Mobile Adapter running on port ${port}`);
  console.log(`  Health:  http://localhost:${port}/mobile/health`);
  console.log(`  State:   http://localhost:${port}/mobile/state`);
  console.log(`  Compare: http://localhost:${port}/mobile/compare`);
  console.log(`  Viewport: ${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height} @${MOBILE_VIEWPORT.dpr}x`);
  console.log(`\n  Waiting for World Node state...`);
});

// Graceful shutdown
const shutdown = (sig: string) => {
  console.log(`\n  ${sig} received — Mobile adapter shutting down...`);
  try { socket.disconnect(); } catch {}
  try { server.close(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
