// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WORLD NODE — Independent Runtime Process
// ════════════════════════════════════════════════════════════════
//
// G1: An independent process that:
//   - loads an immutable WorldBuild (from the control plane API)
//   - owns authoritative state (in-memory + durable event log)
//   - runs the Kernel (scheduler, mutations, capability enforcement)
//   - accepts SSE clients (Web, Unity, Mobile)
//   - streams state updates (snapshot + delta with sequence numbers)
//   - persists state via appendable event log (recoverable after crash)
//   - exposes health endpoint (buildHash, entityCount, playerCount, protocolVersion)
//
// Usage:
//   bun run mini-services/world-node/index.ts --build <buildId> --port 3001 --control-plane http://localhost:3000
//
// The web application (port 3000) is the CONTROL PLANE.
// The world node (port 3001) is the RUNTIME.

import { createServer } from "http";
import { WebSocketServer } from "ws";

// ── Parse args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const buildId = args[args.indexOf("--build") + 1] ?? process.env.WORLD_BUILD_ID;
const port = parseInt(args[args.indexOf("--port") + 1] ?? "3001");
const controlPlane = args[args.indexOf("--control-plane") + 1] ?? process.env.CONTROL_PLANE_URL ?? "http://localhost:3000";

if (!buildId) {
  console.error("Usage: bun run index.ts --build <buildId> [--port 3001] [--control-plane http://localhost:3000]");
  process.exit(1);
}

console.log(`╔══════════════════════════════════════════════════╗`);
console.log(`║  PlayLiquid World Node                           ║`);
console.log(`║  Build: ${buildId.slice(0, 20)}                    ║`);
console.log(`║  Port:  ${port}                                   ║`);
console.log(`║  Control Plane: ${controlPlane.slice(0, 30)}       ║`);
console.log(`╚══════════════════════════════════════════════════╝`);

// ── Authoritative State ───────────────────────────────────────────
interface EntityState {
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  seq: number;
  updatedAt: number;
}

const authoritativeState = new Map<string, EntityState>();
const sessions = new Map<string, { name: string; connectedAt: number }>();
const subscribers = new Set<(data: string) => void>();
let buildSeq = 0;
let buildHash = "";
let worldProjectId = "";
const startedAt = Date.now();

// ── Event Log (durable persistence) ───────────────────────────────
// G2: Append-only event log + periodic snapshots for crash recovery.
// On restart: load latest snapshot → replay events after snapshot → state restored.

interface LogEntry {
  seq: number;
  type: string; // "spawn" | "mutate" | "remove" | "session.join" | "session.leave"
  entityId?: string;
  position?: { x: number; y: number; z: number };
  statePatch?: Record<string, unknown>;
  positionPatch?: { x: number; y: number; z: number };
  timestamp: number;
}

const eventLog: LogEntry[] = [];
const LOG_FILE = `/tmp/playliquid-events-${buildId}.log`;
const SNAPSHOT_FILE = `/tmp/playliquid-snapshot-${buildId}.json`;
let lastSnapshotSeq = 0;
let eventsSinceSnapshot = 0;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");

function appendLog(entry: LogEntry) {
  eventLog.push(entry);
  eventsSinceSnapshot++;
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  } catch {}

  // Periodic snapshot every 50 events
  if (eventsSinceSnapshot >= 50) {
    writeSnapshot();
  }
}

// ── Snapshot: full state checkpoint ───────────────────────────────
function writeSnapshot() {
  try {
    const snapshotData = {
      buildSeq,
      lastSnapshotSeq: buildSeq,
      timestamp: Date.now(),
      entities: Array.from(authoritativeState.entries()).map(([id, e]) => ({
        entityId: id,
        position: e.position,
        state: e.state,
        seq: e.seq,
      })),
      sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })),
    };
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshotData));
    lastSnapshotSeq = buildSeq;
    eventsSinceSnapshot = 0;
    console.log(`  Snapshot written: ${snapshotData.entities.length} entities, seq=${buildSeq}`);
  } catch (err) {
    console.error("  Snapshot write failed:", err);
  }
}

// ── Recovery: load snapshot + replay events after snapshot ────────
function recoverState() {
  let recoveredFromSnapshot = false;

  // 1. Try to load snapshot
  try {
    const snapshotData = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf-8"));
    buildSeq = snapshotData.buildSeq ?? 0;
    lastSnapshotSeq = snapshotData.lastSnapshotSeq ?? 0;

    for (const e of snapshotData.entities) {
      authoritativeState.set(e.entityId, {
        position: e.position,
        state: e.state,
        seq: e.seq,
        updatedAt: snapshotData.timestamp,
      });
    }

    for (const s of (snapshotData.sessions ?? [])) {
      sessions.set(s.sessionId, { name: s.name, connectedAt: s.connectedAt });
    }

    console.log(`  Snapshot recovered: ${snapshotData.entities.length} entities, seq=${buildSeq}`);
    recoveredFromSnapshot = true;
  } catch {
    console.log("  No snapshot found — starting fresh");
  }

  // 2. Replay events AFTER the snapshot
  try {
    const data = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = data.trim().split("\n");
    let replayed = 0;

    for (const line of lines) {
      const entry = JSON.parse(line) as LogEntry;

      // Skip events at or before the snapshot
      if (recoveredFromSnapshot && entry.seq <= lastSnapshotSeq) continue;

      if (entry.type === "spawn") {
        authoritativeState.set(entry.entityId!, {
          position: entry.position!,
          state: {},
          seq: entry.seq,
          updatedAt: entry.timestamp,
        });
      } else if (entry.type === "mutate") {
        const entity = authoritativeState.get(entry.entityId!);
        if (entity) {
          if (entry.positionPatch) {
            entity.position.x += entry.positionPatch.x;
            entity.position.y += entry.positionPatch.y;
            entity.position.z += entry.positionPatch.z;
          }
          if (entry.statePatch) {
            entity.state = { ...entity.state, ...entry.statePatch };
          }
          entity.seq = entry.seq;
          entity.updatedAt = entry.timestamp;
        }
      } else if (entry.type === "remove") {
        authoritativeState.delete(entry.entityId!);
      }
      buildSeq = Math.max(buildSeq, entry.seq);
      replayed++;
    }

    if (replayed > 0) {
      console.log(`  Replay: ${replayed} events after snapshot (seq ${lastSnapshotSeq} → ${buildSeq})`);
    } else if (recoveredFromSnapshot) {
      console.log(`  No events to replay after snapshot`);
    }
  } catch {
    if (!recoveredFromSnapshot) {
      console.log("  No event log found — starting completely fresh");
    }
  }
}

// ── Load World Build from Control Plane ──────────────────────────
async function loadWorldBuild() {
  console.log("Loading World Build from control plane...");
  const res = await fetch(`${controlPlane}/api/runtime/${buildId}/scene`);
  if (!res.ok) {
    console.error(`Failed to load build: HTTP ${res.status}`);
    process.exit(1);
  }
  const scene = await res.json();
  buildHash = scene.world.buildHash;
  worldProjectId = scene.world.id;

  console.log(`  World: ${scene.world.name} v${scene.world.buildVersion}`);
  console.log(`  Hash: ${buildHash.slice(0, 16)}`);
  console.log(`  Entities: ${scene.entities.length}`);
  console.log(`  Anchors: ${scene.anchors.length}`);
  console.log(`  Protocol: ${scene.runtime.protocolVersion}`);

  // Initialize authoritative state from scene entities
  for (const e of scene.entities) {
    authoritativeState.set(e.id, {
      position: e.position,
      state: e.state,
      seq: 0,
      updatedAt: Date.now(),
    });
    appendLog({
      seq: 0, type: "spawn", entityId: e.id,
      position: e.position, timestamp: Date.now(),
    });
  }

  console.log(`  State initialized: ${authoritativeState.size} entities`);
}

// ── Broadcast to all subscribers ─────────────────────────────────
function broadcast(data: string) {
  for (const writer of subscribers) {
    try { writer(data); } catch {}
  }
}

function broadcastStateUpdate(entityId: string) {
  const entity = authoritativeState.get(entityId);
  if (!entity) return;
  broadcast(JSON.stringify({
    type: "state",
    entityId,
    position: entity.position,
    state: entity.state,
    seq: entity.seq,
    buildSeq,
    protocolVersion: "1.0.0",
    updatedAt: entity.updatedAt,
  }));
}

function broadcastEvent(event: { type: string; [key: string]: unknown }) {
  broadcast(JSON.stringify({ type: "event", ...event }));
}

// ── Mutate entity state ──────────────────────────────────────────
function mutateEntityState(
  entityId: string,
  mutation: { positionPatch?: { x: number; y: number; z: number }; statePatch?: Record<string, unknown> }
): boolean {
  const entity = authoritativeState.get(entityId);
  if (!entity) return false;

  buildSeq++;
  if (mutation.positionPatch) {
    entity.position.x += mutation.positionPatch.x;
    entity.position.y += mutation.positionPatch.y;
    entity.position.z += mutation.positionPatch.z;
  }
  if (mutation.statePatch) {
    entity.state = { ...entity.state, ...mutation.statePatch };
  }
  entity.seq = buildSeq;
  entity.updatedAt = Date.now();

  appendLog({
    seq: buildSeq, type: "mutate", entityId,
    positionPatch: mutation.positionPatch,
    statePatch: mutation.statePatch,
    timestamp: entity.updatedAt,
  });

  broadcastStateUpdate(entityId);
  return true;
}

// ── Session management ───────────────────────────────────────────
function createSession(name: string): string {
  const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessions.set(sessionId, { name, connectedAt: Date.now() });

  // Spawn player avatar
  const avatarId = `avatar-${sessionId}`;
  const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
  const playerArtifact = JSON.stringify({
    abiVersion: "1.0.0",
    name: `@playliquid/player/${sessionId}`,
    displayName: name,
    family: "avatar",
    capabilities: ["avatar.movement"],
    provides: ["avatar.movement"],
    requires: ["navigation.walkable"],
    initialState: { direction: 0, color, name, sessionId },
    update: { behavior: "static", params: {} },
    render: { behavior: "shape", params: { shape: "sphere", size: 2, color, emissive: color, metalness: 0.3, roughness: 0.7, showDirection: true, label: name } },
    onClick: { behavior: "emit", params: { event: "player.click" } },
  });

  authoritativeState.set(avatarId, {
    position: { x: (Math.random() - 0.5) * 20, y: 0, z: (Math.random() - 0.5) * 20 },
    state: { name, sessionId, declarativeArtifact: playerArtifact, direction: 0, color },
    seq: buildSeq,
    updatedAt: Date.now(),
  });

  buildSeq++;
  appendLog({ seq: buildSeq, type: "spawn", entityId: avatarId, position: authoritativeState.get(avatarId)!.position, timestamp: Date.now() });
  broadcastStateUpdate(avatarId);
  broadcastEvent({ event: "session.join", sessionId, name });

  return sessionId;
}

function removeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  const avatarId = `avatar-${sessionId}`;
  authoritativeState.delete(avatarId);
  if (session) {
    buildSeq++;
    appendLog({ seq: buildSeq, type: "remove", entityId: avatarId, timestamp: Date.now() });
    broadcastEvent({ event: "session.leave", sessionId, name: session.name });
    broadcastEvent({ event: "entity.remove", entityId: avatarId });
  }
}

// ── HTTP Server ──────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = new URL(req.url!, `http://localhost:${port}`);

  // ── Health endpoint ──────────────────────────────────────────
  if (url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      nodeId: `node-${buildId.slice(0, 8)}`,
      buildHash,
      buildVersion: 1,
      status: "running",
      entityCount: authoritativeState.size,
      playerCount: sessions.size,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      host: "world-node",
      protocolVersion: "1.0.0",
      capabilities: { spatial: true, persistence: "event-log", networking: "sse" },
    }));
    return;
  }

  // ── SSE stream ───────────────────────────────────────────────
  if (url.pathname === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send snapshot
    const snapshot = JSON.stringify({
      type: "snapshot",
      entities: Array.from(authoritativeState.entries()).map(([id, e]) => ({
        entityId: id, position: e.position, state: e.state,
      })),
      sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })),
      protocolVersion: "1.0.0",
      buildSeq,
      buildHash,
    });
    res.write(`data: ${snapshot}\n\n`);

    // Subscribe
    const writer = (data: string) => {
      try { res.write(`data: ${data}\n\n`); } catch {}
    };
    subscribers.add(writer);

    req.on("close", () => {
      subscribers.delete(writer);
    });
    return;
  }

  // ── Mutate endpoint ──────────────────────────────────────────
  if (url.pathname === "/mutate" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { entityId, positionPatch, statePatch } = JSON.parse(body);
        const ok = mutateEntityState(entityId, { positionPatch, statePatch });
        res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid body" }));
      }
    });
    return;
  }

  // ── Session endpoint ─────────────────────────────────────────
  if (url.pathname === "/session" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { action, sessionId, name } = JSON.parse(body);
        if (action === "join") {
          const sid = createSession(name ?? "Anonymous");
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ sessionId: sid, sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })) }));
        } else if (action === "leave") {
          removeSession(sessionId);
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: true }));
        } else if (action === "list") {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })) }));
        }
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid body" }));
      }
    });
    return;
  }

  // ── Move player endpoint ─────────────────────────────────────
  if (url.pathname === "/move-player" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { sessionId, deltaX, deltaZ } = JSON.parse(body);
        const avatarId = `avatar-${sessionId}`;
        const ok = mutateEntityState(avatarId, { positionPatch: { x: deltaX, y: 0, z: deltaZ } });
        if (ok && (deltaX !== 0 || deltaZ !== 0)) {
          mutateEntityState(avatarId, { statePatch: { direction: Math.atan2(deltaZ, deltaX) } });
        }
        res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid body" }));
      }
    });
    return;
  }

  // ── Event log endpoint (for replay/recovery) ─────────────────
  if (url.pathname === "/event-log") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ entries: eventLog.length, buildSeq, logFile: LOG_FILE }));
    return;
  }

  // ── Snapshot endpoint (force or inspect) ─────────────────────
  if (url.pathname === "/snapshot") {
    if (req.method === "POST") {
      writeSnapshot();
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ ok: true, seq: buildSeq, entities: authoritativeState.size }));
    } else {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({
        lastSnapshotSeq,
        eventsSinceSnapshot,
        buildSeq,
        entities: authoritativeState.size,
        snapshotFile: SNAPSHOT_FILE,
      }));
    }
    return;
  }

  // ── Recovery endpoint (inspect recovery state) ───────────────
  if (url.pathname === "/recovery") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      hasSnapshot: fs.existsSync(SNAPSHOT_FILE),
      hasEventLog: fs.existsSync(LOG_FILE),
      lastSnapshotSeq,
      eventLogEntries: eventLog.length,
      buildSeq,
      entities: authoritativeState.size,
      logFile: LOG_FILE,
      snapshotFile: SNAPSHOT_FILE,
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ── Start ────────────────────────────────────────────────────────
async function main() {
  // G2: Recover state from snapshot + event log (crash recovery)
  recoverState();

  // Only load from control plane if we didn't recover state
  if (authoritativeState.size === 0) {
    await loadWorldBuild();
  } else {
    // Fetch build metadata if not already loaded
    if (!buildHash) {
      try {
        const res = await fetch(`${controlPlane}/api/runtime/${buildId}/scene`);
        if (res.ok) {
          const scene = await res.json();
          buildHash = scene.world.buildHash;
          worldProjectId = scene.world.id;
          console.log(`  Build metadata loaded: ${scene.world.name} v${scene.world.buildVersion}`);
        }
      } catch {}
    }
    console.log(`  State recovered from log — skipping full scene load`);
  }

  // Start server
  server.listen(port, () => {
    console.log(`\n✓ World Node running on port ${port}`);
    console.log(`  Health:    http://localhost:${port}/health`);
    console.log(`  Stream:    http://localhost:${port}/stream`);
    console.log(`  Mutate:    http://localhost:${port}/mutate`);
    console.log(`  Session:   http://localhost:${port}/session`);
    console.log(`  Event Log: ${eventLog.length} entries (${LOG_FILE})`);
    console.log(`  Snapshot:  ${lastSnapshotSeq > 0 ? `seq=${lastSnapshotSeq}` : "none yet"}`);
    console.log(`\n  Waiting for clients...`);
  });

  // Graceful shutdown — write final snapshot
  process.on("SIGTERM", () => {
    console.log("\n  SIGTERM received — writing final snapshot...");
    writeSnapshot();
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log("\n  SIGINT received — writing final snapshot...");
    writeSnapshot();
    process.exit(0);
  });
}

main().catch(console.error);
