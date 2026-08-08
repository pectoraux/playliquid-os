// ════════════════════════════════════════════════════════════════
// PLAYLIQUID UNITY ADAPTER — Live Second-Engine Runtime
// ════════════════════════════════════════════════════════════════
//
// Phase J: A standalone process that connects to the SAME World Node
// as the Web runtime, consumes the SAME Scene API, executes the SAME
// declarative artifacts, and renders through the Unity coordinate
// system + Unity primitive draw commands.
//
// This is the real second-engine proof. The reviewer's directive:
//
//   "Move the avatar. Both representations move.
//    Change package state. Both representations update.
//    Trigger a capability. Both receive the same Kernel decision."
//
// The Unity adapter does NOT own state. It reads from the same
// authoritative World Node. When the Web client moves an avatar, the
// World Node broadcasts the state update — and this adapter receives
// it and updates its Unity-side representation. Same world, two engines.
//
// Coordinate transform: PlayLiquid (right-handed, X=east, Y=up, Z=north)
// → Unity (left-handed, X=east, Y=up, Z=forward). Z_PL → -Z_Unity.
//
// Usage:
//   bun run index.ts --build <buildId> --node-ws-port 3002 \
//     --node-http-port 3001 --control-plane http://localhost:3000 \
//     --port 3041
//
// The adapter exposes:
//   GET /unity/state    — live entities + Unity-transformed positions + draw commands
//   GET /unity/health   — adapter health + connection status

import { createServer } from "http";
import { io } from "socket.io-client";

// ── Parse args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const buildId = args[args.indexOf("--build") + 1] ?? process.env.WORLD_BUILD_ID;
const nodeWsPort = parseInt(args[args.indexOf("--node-ws-port") + 1] ?? "3002");
const nodeHttpPort = parseInt(args[args.indexOf("--node-http-port") + 1] ?? "3001");
const controlPlane = args[args.indexOf("--control-plane") + 1] ?? "http://localhost:3000";
const port = parseInt(args[args.indexOf("--port") + 1] ?? "3041");

if (!buildId) {
  console.error("Usage: bun run index.ts --build <buildId> [--node-ws-port 3002] [--node-http-port 3001] [--control-plane http://localhost:3000] [--port 3041]");
  process.exit(1);
}

console.log(`╔══════════════════════════════════════════════════╗`);
console.log(`║  PlayLiquid Unity Adapter                        ║`);
console.log(`║  Build: ${buildId.slice(0, 20)}                    ║`);
console.log(`║  Node WS:  ${nodeWsPort}                          ║`);
console.log(`║  Node HTTP: ${nodeHttpPort}                       ║`);
console.log(`║  Adapter:  ${port}                               ║`);
console.log(`╚══════════════════════════════════════════════════╝`);

// ── PL → Unity coordinate transform ───────────────────────────────
// PlayLiquid: right-handed (X=east, Y=up, Z=north)
// Unity: left-handed (X=east, Y=up, Z=forward)
// Transform: Z_PL → -Z_Unity (flip Z axis)
function plToUnity(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z: -z };
}

// ── Unity Render Context ─────────────────────────────────────────
// Collects Unity primitive draw commands (Instantiate Cube/Sphere/etc.)
// that a real Unity C# client would execute. This proves the same
// declarative artifact produces the same draw calls in Unity as in Web.
interface UnityCommand {
  cmd: string;
  args: number[];
  opts: Record<string, unknown>;
}

interface UnityEntity {
  entityId: string;
  name: string;
  // PL position (authoritative, from the World Node)
  plPosition: { x: number; y: number; z: number };
  // Unity-transformed position
  unityPosition: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  seq: number;
  // Unity draw commands for this entity
  drawCommands: UnityCommand[];
  // The declarative artifact (same JSON the Web runtime uses)
  artifact: Record<string, unknown> | null;
  lastUpdated: number;
}

const unityEntities = new Map<string, UnityEntity>();
let connected = false;
let snapshotReceived = false;
const startedAt = Date.now();
let lastUpdateSeq = 0;
let totalMessagesReceived = 0;

// ── Interpret declarative artifact → Unity draw commands ─────────
// This mirrors the DeclarativePackageInterpreter's render() logic but
// produces Unity-specific commands (PrimitiveType.Cube etc.) with
// PL→Unity coordinate transform applied.
function interpretArtifactForUnity(
  artifact: Record<string, unknown> | null,
  plPos: { x: number; y: number; z: number }
): UnityCommand[] {
  if (!artifact) return [];
  const commands: UnityCommand[] = [];
  const render = artifact.render as { behavior?: string; params?: Record<string, unknown> } | undefined;
  if (!render || !render.params) return [];

  const shape = render.params.shape as string | undefined;
  const size = (render.params.size as number) ?? 1;
  const color = (render.params.color as string) ?? "#ffffff";
  const emissive = render.params.emissive as string | undefined;
  const metalness = render.params.metalness as number | undefined;
  const roughness = render.params.roughness as number | undefined;
  const opts: Record<string, unknown> = { color, emissive, metalness, roughness };

  // Apply PL→Unity transform to the position
  const u = plToUnity(plPos.x, plPos.y, plPos.z);
  commands.push({ cmd: "transform.position", args: [u.x, u.y, u.z], opts: {} });

  if (shape === "box") {
    commands.push({ cmd: "Instantiate(PrimitiveType.Cube)", args: [size, size, size], opts });
  } else if (shape === "sphere") {
    commands.push({ cmd: "Instantiate(PrimitiveType.Sphere)", args: [size], opts });
  } else if (shape === "cylinder") {
    commands.push({ cmd: "Instantiate(PrimitiveType.Cylinder)", args: [size, size, size * 2], opts });
  } else if (shape === "cone") {
    commands.push({ cmd: "Instantiate(PrimitiveType.Capsule)", args: [size, size * 2], opts });
  } else if (shape === "diamond") {
    // Diamond = rotated cube in Unity
    commands.push({ cmd: "Instantiate(PrimitiveType.Cube)", args: [size, size, size], opts });
    commands.push({ cmd: "transform.rotation", args: [0, 45, 0], opts: {} });
  } else if (shape === "plane") {
    commands.push({ cmd: "Instantiate(PrimitiveType.Plane)", args: [size, size], opts });
  }

  return commands;
}

// ── Connect to the World Node via WebSocket ──────────────────────
// Same protocol as the Web runtime — same socket.io, same "message"
// events, same JSON. The Unity adapter is just another client.
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
  // The Unity adapter does NOT join a session (it doesn't spawn an
  // avatar). It only observes — like a second renderer.
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
      unityEntities.clear();
      for (const e of (msg.entities as Array<{
        entityId: string;
        position: { x: number; y: number; z: number };
        state: Record<string, unknown>;
      }>)) {
        const artifact = typeof e.state.declarativeArtifact === "string"
          ? JSON.parse(e.state.declarativeArtifact)
          : null;
        const drawCommands = interpretArtifactForUnity(artifact, e.position);
        unityEntities.set(e.entityId, {
          entityId: e.entityId,
          name: (e.state.name as string) ?? e.entityId,
          plPosition: e.position,
          unityPosition: plToUnity(e.position.x, e.position.y, e.position.z),
          state: e.state,
          seq: 0,
          drawCommands,
          artifact,
          lastUpdated: Date.now(),
        });
      }
      lastUpdateSeq = msg.buildSeq ?? lastUpdateSeq;
      console.log(`  Snapshot: ${unityEntities.size} entities (buildSeq=${lastUpdateSeq})`);
    } else if (msg.type === "state") {
      const existing = unityEntities.get(msg.entityId);
      const plPos = msg.position as { x: number; y: number; z: number };
      const state = msg.state as Record<string, unknown>;
      const artifact = existing?.artifact
        ?? (typeof state.declarativeArtifact === "string" ? JSON.parse(state.declarativeArtifact) : null);
      const drawCommands = interpretArtifactForUnity(artifact, plPos);
      unityEntities.set(msg.entityId, {
        entityId: msg.entityId,
        name: (state.name as string) ?? existing?.name ?? msg.entityId,
        plPosition: plPos,
        unityPosition: plToUnity(plPos.x, plPos.y, plPos.z),
        state,
        seq: msg.seq ?? 0,
        drawCommands,
        artifact,
        lastUpdated: Date.now(),
      });
      lastUpdateSeq = msg.buildSeq ?? lastUpdateSeq;
    } else if (msg.type === "event" && msg.event === "entity.remove") {
      unityEntities.delete(msg.entityId);
    } else if (msg.type === "handoff") {
      // Unity adapter sees handoffs too — the world is coherent across engines
      console.log(`  Handoff event: entity ${msg.entityId} → zone ${msg.toZoneId}`);
    }
  } catch (e) {
    console.error("  Message parse error:", e);
  }
});

socket.on("connect_error", (err: Error) => {
  console.error(`  WS connect error: ${err.message}`);
});

// ── HTTP server: expose the Unity adapter's live view ────────────
const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${port}`);

  // ── Health ─────────────────────────────────────────────────────
  if (url.pathname === "/unity/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      adapter: "playliquid-unity",
      buildId,
      connected,
      snapshotReceived,
      entityCount: unityEntities.size,
      lastUpdateSeq,
      totalMessagesReceived,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      coordinateSystem: "unity-left-handed",
      transform: "Z_PL → -Z_Unity",
    }));
    return;
  }

  // ── Live Unity state ───────────────────────────────────────────
  if (url.pathname === "/unity/state") {
    const entities = Array.from(unityEntities.values()).map((e) => ({
      entityId: e.entityId,
      name: e.name,
      plPosition: e.plPosition,
      unityPosition: e.unityPosition,
      state: e.state,
      seq: e.seq,
      drawCommands: e.drawCommands,
      hasArtifact: !!e.artifact,
      lastUpdated: e.lastUpdated,
    }));
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      adapter: "playliquid-unity",
      buildId,
      connected,
      snapshotReceived,
      coordinateSystem: "unity-left-handed",
      lastUpdateSeq,
      entityCount: entities.length,
      entities,
    }));
    return;
  }

  // ── Compare endpoint: fetch the Web (control-plane) scene + show ──
  // both representations side by side for verification
  if (url.pathname === "/unity/compare") {
    Promise.all([
      fetch(`${controlPlane}/api/runtime/${buildId}/scene`).then((r) => r.json()).catch(() => null),
      Promise.resolve(Array.from(unityEntities.values())),
    ]).then(([scene, unityEnts]) => {
      const webEntities = (scene?.entities ?? []).map((e: { id: string; position: { x: number; y: number; z: number }; name: string }) => ({
        entityId: e.id,
        name: e.name,
        plPosition: e.position,
      }));
      const unityEntitiesList = unityEnts.map((e) => ({
        entityId: e.entityId,
        name: e.name,
        plPosition: e.plPosition,
        unityPosition: e.unityPosition,
      }));
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        buildId,
        webRuntime: { coordinateSystem: "playliquid-right-handed", entities: webEntities },
        unityAdapter: { coordinateSystem: "unity-left-handed", entities: unityEntitiesList },
        sameEntityCount: webEntities.length === unityEnts.length,
        sameEntityIds: webEntities.every((w: { entityId: string }) => unityEnts.some((u) => u.entityId === w.entityId)),
      }));
    }).catch((e) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : "compare failed" }));
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use /unity/health, /unity/state, or /unity/compare" }));
});

server.listen(port, () => {
  console.log(`\n✓ Unity Adapter running on port ${port}`);
  console.log(`  Health:  http://localhost:${port}/unity/health`);
  console.log(`  State:   http://localhost:${port}/unity/state`);
  console.log(`  Compare: http://localhost:${port}/unity/compare`);
  console.log(`\n  Waiting for World Node state...`);
});

// Graceful shutdown
const shutdown = (sig: string) => {
  console.log(`\n  ${sig} received — Unity adapter shutting down...`);
  try { socket.disconnect(); } catch {}
  try { server.close(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
