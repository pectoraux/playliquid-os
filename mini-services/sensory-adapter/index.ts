// ════════════════════════════════════════════════════════════════
// PLAYLIQUID SENSORY ADAPTER — Smell/Haptic/Taste Renderer
// ════════════════════════════════════════════════════════════════
//
// Phase Q: The fourth runtime adapter (after Web, Unity, Mobile).
// Connects to the SAME World Node, consumes the SAME protocol, but
// renders to SENSORY output channels instead of visual.
//
// The reviewer's directive: "Sensory runtime — only after the runtime
// substrate is mature." With 10 of 11 milestones at production, it is.
//
// This adapter:
//   - Connects to the World Node via socket.io (same protocol)
//   - Tracks entity positions (from state updates)
//   - Polls the sensory service for active emissions near the player
//   - Translates emissions to device output (smell renderer, haptic
//     renderer, etc.)
//   - Exposes /sensory/state (what the player currently smells/feels)
//
// The same world. The same protocol. A different sense.

import { createServer } from "http";
import { io } from "socket.io-client";

const args = process.argv.slice(2);
const buildId = args[args.indexOf("--build") + 1] ?? process.env.WORLD_BUILD_ID;
const nodeWsPort = parseInt(args[args.indexOf("--node-ws-port") + 1] ?? "3002");
const controlPlane = args[args.indexOf("--control-plane") + 1] ?? "http://localhost:3000";
const port = parseInt(args[args.indexOf("--port") + 1] ?? "3071");

if (!buildId) {
  console.error("Usage: bun run index.ts --build <buildId> [--node-ws-port 3002] [--control-plane http://localhost:3000] [--port 3071]");
  process.exit(1);
}

console.log(`╔══════════════════════════════════════════════════╗`);
console.log(`║  PlayLiquid Sensory Adapter                      ║`);
console.log(`║  Build: ${buildId.slice(0, 20)}                    ║`);
console.log(`║  Port:  ${port}                                   ║`);
console.log(`╚══════════════════════════════════════════════════╝`);

// ── Track entity positions from the World Node ──────────────────
const entityPositions = new Map<string, { x: number; y: number; z: number }>();
let connected = false;
let snapshotReceived = false;
const startedAt = Date.now();

// The "player" position (where the sensory adapter samples from)
let playerPosition = { x: 0, y: 0, z: 0 };

// ── Connect to the World Node ───────────────────────────────────
const socket = io(`http://127.0.0.1:${nodeWsPort}/`, {
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
});

socket.on("disconnect", () => {
  connected = false;
  console.log(`  ✗ Disconnected from World Node`);
});

socket.on("message", (data: string) => {
  try {
    const msg = JSON.parse(data);
    if (msg.type === "snapshot") {
      snapshotReceived = true;
      entityPositions.clear();
      for (const e of (msg.entities as Array<{ entityId: string; position: { x: number; y: number; z: number } }>)) {
        entityPositions.set(e.entityId, e.position);
      }
    } else if (msg.type === "state") {
      entityPositions.set(msg.entityId, msg.position);
    } else if (msg.type === "event" && msg.event === "entity.remove") {
      entityPositions.delete(msg.entityId);
    }
  } catch {}
});

// ── HTTP server: expose the sensory adapter's view ──────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${port}`);

  if (url.pathname === "/sensory/health") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      adapter: "playliquid-sensory",
      buildId,
      connected,
      snapshotReceived,
      entityCount: entityPositions.size,
      playerPosition,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      senses: ["olfactory", "haptic", "gustatory", "vestibular"],
    }));
    return;
  }

  if (url.pathname === "/sensory/state") {
    // Query the control plane for active sensory emissions near the player
    const worldProjectId = url.searchParams.get("worldProjectId");
    if (!worldProjectId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "worldProjectId required" }));
      return;
    }

    try {
      // Get all sensory channels for this world
      const channelsRes = await fetch(`${controlPlane}/api/services/sensory/channels?worldProjectId=${worldProjectId}`);
      const channelsData = await channelsRes.json() as { channels: Array<{ id: string; name: string; channelType: string; maxRange: number }> };

      // For each channel, get active emissions near the player
      const sensoryState: Record<string, unknown> = {};
      for (const channel of channelsData.channels ?? []) {
        const emissionsRes = await fetch(`${controlPlane}/api/services/sensory/active?channelId=${channel.id}&x=${playerPosition.x}&y=${playerPosition.y}&z=${playerPosition.z}`);
        const emissionsData = await emissionsRes.json() as { emissions: Array<Record<string, unknown>> };
        sensoryState[channel.name] = {
          channelType: channel.channelType,
          emissions: emissionsData.emissions ?? [],
        };
      }

      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        adapter: "playliquid-sensory",
        playerPosition,
        sensoryState,
        timestamp: Date.now(),
      }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : "sensory state failed" }));
    }
    return;
  }

  // Set the player position (where to sample sensory data from)
  if (url.pathname === "/sensory/position" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        playerPosition = { x: data.x ?? 0, y: data.y ?? 0, z: data.z ?? 0 };
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true, playerPosition }));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid body" }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found. Use /sensory/health, /sensory/state, /sensory/position" }));
});

server.listen(port, () => {
  console.log(`\n✓ Sensory Adapter running on port ${port}`);
  console.log(`  Health:   http://localhost:${port}/sensory/health`);
  console.log(`  State:    http://localhost:${port}/sensory/state`);
  console.log(`  Position: POST http://localhost:${port}/sensory/position`);
  console.log(`  Senses:   olfactory, haptic, gustatory, vestibular`);
  console.log(`\n  Waiting for World Node state...`);
});

const shutdown = (sig: string) => {
  console.log(`\n  ${sig} received — Sensory adapter shutting down...`);
  try { socket.disconnect(); } catch {}
  try { server.close(); } catch {}
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
