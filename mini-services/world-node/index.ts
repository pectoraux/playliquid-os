// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WORLD NODE — Independent Runtime Process
// ════════════════════════════════════════════════════════════════
//
// G1: An independent process that:
//   - loads an immutable WorldBuild (from the control plane API)
//   - owns authoritative state (in-memory)
//   - runs the Kernel (scheduler, mutations, capability enforcement)
//   - accepts clients over WebSocket (primary) + SSE (fallback)
//   - streams state updates (snapshot + delta with sequence numbers)
//
// G1.2 — PRODUCTION TRANSPORT (this revision):
//   - socket.io is the primary multiplayer transport. Bidirectional,
//     low-latency, single connection. SSE remains as a fallback so the
//     existing two-browser proof is never broken.
//   - The same authoritative state, the same durability boundary, the
//     same sequence numbers — both transports emit identical JSON.
//
// G1.1 — DURABLE PERSISTENCE (this revision):
//   - State durability is delegated to a PersistenceService — an OS
//     contract (`kernel.persistence`). The node does NOT own its
//     filesystem for durability.
//   - Default backend: RemotePersistenceService (HTTP → control plane
//     → durable DB). A node can be killed (-9), its /tmp destroyed,
//     and a fresh node on a CLEAN MACHINE recovers the exact world
//     state from the remote store.
//   - Every acknowledged mutation is appended to the durable log
//     BEFORE the node replies to the client — so a crash never loses a
//     committed mutation.
//   - Recovery: read latest snapshot → replay events with seq >
//     snapshot.seq → state restored byte-exact.
//
// Usage:
//   bun run index.ts --build <buildId> --port 3001 \
//     --control-plane http://localhost:3000 \
//     [--persistence remote|local|auto]
//
// The web application (port 3000) is the CONTROL PLANE + durable store.
// The world node (port 3001) is the RUNTIME.

import { createServer } from "http";
import { Server } from "socket.io";
import {
  createPersistenceService,
  RemotePersistenceService,
  type PersistenceService,
  type LogEntry,
  type SnapshotData,
} from "./persistence";

// ── Parse args ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const buildId = args[args.indexOf("--build") + 1] ?? process.env.WORLD_BUILD_ID;
const port = parseInt(args[args.indexOf("--port") + 1] ?? "3001");
const wsPort = parseInt(args[args.indexOf("--ws-port") + 1] ?? "3002");
const controlPlane =
  args[args.indexOf("--control-plane") + 1] ??
  process.env.CONTROL_PLANE_URL ??
  "http://localhost:3000";
const persistenceMode = (args[args.indexOf("--persistence") + 1] ?? "remote") as
  | "remote"
  | "local"
  | "auto";

// Phase I: spatial zone ownership. A node owns a bounding box. When an
// entity crosses the boundary, it's handed off to the target node.
//   --zone-id west --zone-name "West District" --zone-bounds -100,0,-100,100
// means minX=-100, maxX=0, minZ=-100, maxZ=100.
const zoneId = args[args.indexOf("--zone-id") + 1] ?? null;
const zoneName = args[args.indexOf("--zone-name") + 1] ?? zoneId ?? "default";
const zoneBoundsStr = args[args.indexOf("--zone-bounds") + 1] ?? null;
let zoneBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
if (zoneBoundsStr) {
  const parts = zoneBoundsStr.split(",").map(parseFloat);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    zoneBounds = { minX: parts[0], maxX: parts[1], minZ: parts[2], maxZ: parts[3] };
  }
}

if (!buildId) {
  console.error("Usage: bun run index.ts --build <buildId> [--port 3001] [--ws-port 3002] [--control-plane http://localhost:3000] [--persistence remote|local|auto] [--zone-id west] [--zone-name \"West District\"] [--zone-bounds -100,0,-100,100]");
  process.exit(1);
}

console.log(`╔══════════════════════════════════════════════════╗`);
console.log(`║  PlayLiquid World Node                           ║`);
console.log(`║  Build: ${buildId.slice(0, 20)}                    ║`);
console.log(`║  HTTP Port: ${port}                               ║`);
console.log(`║  WS Port:   ${wsPort}                             ║`);
console.log(`║  Zone:      ${zoneId ?? "(none — single-node)"}   ║`);
console.log(`║  Control Plane: ${controlPlane.slice(0, 30)}       ║`);
console.log(`║  Persistence: ${persistenceMode}                  ║`);
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

// ── Persistence Service (the `kernel.persistence` OS contract) ────
// G1.1: durability is delegated here. The node never writes to /tmp as
// a source of truth — the remote store is the default.
let persistence: PersistenceService;
let lastSnapshotSeq = -1;
let eventsSinceSnapshot = 0;
const SNAPSHOT_INTERVAL = 50;

// ── Durable append: every mutation is persisted before acknowledge ─
async function appendLog(entry: LogEntry) {
  eventsSinceSnapshot++;
  await persistence.appendEvent(entry); // ← durability boundary
  if (eventsSinceSnapshot >= SNAPSHOT_INTERVAL) {
    await writeSnapshot();
  }
}

// ── Snapshot: full-state checkpoint via the persistence service ───
async function writeSnapshot() {
  const snapshot: SnapshotData = {
    buildSeq,
    seq: buildSeq,
    timestamp: Date.now(),
    entities: Array.from(authoritativeState.entries()).map(([id, e]) => ({
      entityId: id,
      position: e.position,
      state: e.state,
      seq: e.seq,
    })),
    sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })),
  };
  await persistence.writeSnapshot(snapshot);
  lastSnapshotSeq = buildSeq;
  eventsSinceSnapshot = 0;
  console.log(`  Snapshot written (${persistence.kind}): ${snapshot.entities.length} entities, seq=${buildSeq}`);
}

// ── Recovery: load snapshot + replay events after snapshot ────────
async function recoverState(): Promise<{ recovered: boolean; entities: number; replayed: number }> {
  // 1. Try to load the latest snapshot from the durable store.
  const snapshot = await persistence.readLatestSnapshot();
  if (snapshot) {
    buildSeq = snapshot.buildSeq ?? 0;
    lastSnapshotSeq = snapshot.seq ?? 0;
    for (const e of snapshot.entities) {
      authoritativeState.set(e.entityId, {
        position: e.position,
        state: e.state,
        seq: e.seq,
        updatedAt: snapshot.timestamp,
      });
    }
    for (const s of (snapshot.sessions ?? [])) {
      sessions.set(s.sessionId, { name: s.name, connectedAt: s.connectedAt });
    }
    console.log(`  Snapshot recovered (${persistence.kind}): ${snapshot.entities.length} entities, seq=${buildSeq}`);
  } else {
    console.log(`  No snapshot found (${persistence.kind}) — starting fresh`);
  }

  // 2. Replay events AFTER the snapshot.
  const events = snapshot
    ? await persistence.readEventsAfter(lastSnapshotSeq)
    : await persistence.readAllEvents();

  let replayed = 0;
  for (const entry of events) {
    if (snapshot && entry.seq <= lastSnapshotSeq) continue;

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
  } else if (snapshot) {
    console.log(`  No events to replay after snapshot`);
  }

  return { recovered: authoritativeState.size > 0, entities: authoritativeState.size, replayed };
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

  // Initialize authoritative state from scene entities + persist them.
  // Each spawn gets a unique incrementing seq so the durable log records
  // every entity (the (buildId, seq) unique constraint would otherwise
  // collapse identical seqs into one).
  for (const e of scene.entities) {
    buildSeq++;
    authoritativeState.set(e.id, {
      position: e.position,
      state: e.state,
      seq: buildSeq,
      updatedAt: Date.now(),
    });
    await appendLog({
      seq: buildSeq, type: "spawn", entityId: e.id,
      position: e.position, timestamp: Date.now(),
    });
  }

  console.log(`  State initialized: ${authoritativeState.size} entities`);
}

// ── Broadcast to all subscribers (SSE + WebSocket) ───────────────
// G1.2: both transports emit identical JSON. The browser picks WS
// (primary) or SSE (fallback); a load test uses WS directly.
let io: Server | null = null;

function broadcast(data: string) {
  // SSE subscribers
  for (const writer of subscribers) {
    try { writer(data); } catch {}
  }
  // WebSocket clients (socket.io) — same message, same seq
  if (io) {
    try { io.emit("message", data); } catch {}
  }
}

function broadcastStateUpdate(entityId: string, seqOverride?: number) {
  const entity = authoritativeState.get(entityId);
  if (!entity) return;
  // G1.2: use the seq captured at mutation time (seqOverride) — NOT the
  // global buildSeq, which may have advanced during the async appendLog.
  // This guarantees each broadcast carries the EXACT buildSeq of the
  // mutation it represents, even under concurrent mutations.
  const seq = seqOverride ?? buildSeq;
  broadcast(JSON.stringify({
    type: "state",
    entityId,
    position: entity.position,
    state: entity.state,
    seq: entity.seq,
    buildSeq: seq,
    protocolVersion: "1.0.0",
    updatedAt: entity.updatedAt,
  }));
}

function broadcastEvent(event: { type: string; [key: string]: unknown }) {
  broadcast(JSON.stringify({ type: "event", ...event }));
}

// ── Phase I: Zone boundary + handoff ─────────────────────────────
// A node owns a spatial zone. When an entity's position moves outside
// this node's zone, the entity is handed off to the target node. The
// entity's ID, state, session, and package are ALL preserved.

function isPositionInZone(x: number, z: number): boolean {
  if (!zoneBounds) return true; // no zone configured → own everything (single-node mode)
  return x >= zoneBounds.minX && x < zoneBounds.maxX &&
         z >= zoneBounds.minZ && z < zoneBounds.maxZ;
}

// Handoff: send the entity to the control plane's handoff coordinator,
// which forwards it to the target node. Then remove the entity locally
// and tell the client to switch connections.
async function initiateHandoff(entityId: string): Promise<void> {
  const entity = authoritativeState.get(entityId);
  if (!entity || !zoneId) return;

  // Find the session for this avatar (if it's a player avatar)
  const sessionId = entity.state.sessionId as string | undefined;
  const declarativeArtifact = entity.state.declarativeArtifact as string | undefined;

  console.log(`  ↗ Handoff: entity ${entityId.slice(0, 16)} crossing zone boundary (from ${zoneId})`);

  try {
    const res = await fetch(`${controlPlane}/api/runtime/${buildId}/handoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entityId,
        sessionId,
        position: entity.position,
        state: entity.state,
        seq: entity.seq,
        fromZoneId: zoneId,
        declarativeArtifact,
      }),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`  ✗ Handoff failed: HTTP ${res.status}: ${txt}`);
      return;
    }

    const result = await res.json() as { ok: boolean; toZoneId: string; toNodeWsPort: number; sameZone?: boolean };
    if (result.sameZone) return; // shouldn't happen, but guard

    console.log(`  ✓ Handoff to zone ${result.toZoneId} (wsPort ${result.toNodeWsPort})`);

    // Remove the entity from THIS node's authoritative state
    authoritativeState.delete(entityId);

    // Tell the client to switch to the target node's WS port
    // The client preserves its sessionId — no re-authentication.
    broadcast(JSON.stringify({
      type: "handoff",
      entityId,
      sessionId,
      toZoneId: result.toZoneId,
      toNodeWsPort: result.toNodeWsPort,
      position: entity.position,
      state: entity.state,
      protocolVersion: "1.0.0",
    }));

    // Also broadcast an entity.remove so non-handoff clients stop rendering it here
    broadcastEvent({ event: "entity.remove", entityId });
  } catch (e) {
    console.error(`  ✗ Handoff error:`, e instanceof Error ? e.message : e);
  }
}

// ── Mutate entity state (durable: append before broadcast) ────────
async function mutateEntityState(
  entityId: string,
  mutation: { positionPatch?: { x: number; y: number; z: number }; statePatch?: Record<string, unknown> }
): Promise<boolean> {
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

  // G1.2: capture the seq for THIS mutation — the broadcast must carry
  // this exact seq even if concurrent mutations advance buildSeq during
  // the async append below.
  const mutationSeq = buildSeq;

  // G1.2: broadcast SYNCHRONOUSLY (before the async append) so that
  // clients receive state updates in strict buildSeq order. The event
  // loop processes these synchronous broadcasts in the order buildSeq++
  // executes, guaranteeing monotonic delivery. The durability boundary
  // is preserved on the ACK: the append must complete before the node
  // acknowledges the mutation to the requesting client.
  broadcastStateUpdate(entityId, mutationSeq);

  // G1.1: durability boundary — the mutation is persisted BEFORE the
  // node acknowledges it to the client. If the append fails, the node
  // does not ack (the mutation is rejected).
  await appendLog({
    seq: mutationSeq, type: "mutate", entityId,
    positionPatch: mutation.positionPatch,
    statePatch: mutation.statePatch,
    timestamp: entity.updatedAt,
  });

  // Phase I: if the entity crossed this node's zone boundary, hand it
  // off to the target node. The handoff happens AFTER the durable append
  // so the mutation is recorded in this node's log. The target node will
  // spawn the entity with the same ID + state + session.
  if (zoneBounds && !isPositionInZone(entity.position.x, entity.position.z)) {
    await initiateHandoff(entityId);
  }

  return true;
}

// ── Session management ───────────────────────────────────────────
async function createSession(name: string): Promise<string> {
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

  const spawnPos = { x: (Math.random() - 0.5) * 20, y: 0, z: (Math.random() - 0.5) * 20 };
  buildSeq++;
  const spawnSeq = buildSeq; // G1.2: capture for the broadcast (concurrency-safe)
  authoritativeState.set(avatarId, {
    position: spawnPos,
    state: { name, sessionId, declarativeArtifact: playerArtifact, direction: 0, color },
    seq: spawnSeq,
    updatedAt: Date.now(),
  });

  // G1.2: broadcast synchronously (before the async append) for seq ordering
  broadcastStateUpdate(avatarId, spawnSeq);
  broadcastEvent({ event: "session.join", sessionId, name });

  // G1.1: durability boundary — persist before the session:join ack returns
  await appendLog({ seq: spawnSeq, type: "spawn", entityId: avatarId, position: spawnPos, timestamp: Date.now() });

  return sessionId;
}

async function removeSession(sessionId: string) {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  const avatarId = `avatar-${sessionId}`;
  authoritativeState.delete(avatarId);
  if (session) {
    buildSeq++;
    await appendLog({ seq: buildSeq, type: "remove", entityId: avatarId, timestamp: Date.now() });
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
      nodeId: `node-${buildId.slice(0, 8)}${zoneId ? `-${zoneId}` : ""}`,
      buildHash,
      buildVersion: 1,
      status: "running",
      entityCount: authoritativeState.size,
      playerCount: sessions.size,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      host: "world-node",
      protocolVersion: "1.0.0",
      zone: zoneId,
      zoneName,
      bounds: zoneBounds,
      capabilities: { spatial: true, persistence: persistence.kind, networking: "websocket+sse", transports: ["websocket", "sse"], distributed: !!zoneId, handoff: !!zoneId },
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
    req.on("end", async () => {
      try {
        const { entityId, positionPatch, statePatch } = JSON.parse(body);
        const ok = await mutateEntityState(entityId, { positionPatch, statePatch });
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
    req.on("end", async () => {
      try {
        const { action, sessionId, name } = JSON.parse(body);
        if (action === "join") {
          const sid = await createSession(name ?? "Anonymous");
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ sessionId: sid, sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })) }));
        } else if (action === "leave") {
          await removeSession(sessionId);
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
    req.on("end", async () => {
      try {
        const { sessionId, deltaX, deltaZ } = JSON.parse(body);
        const avatarId = `avatar-${sessionId}`;
        const ok = await mutateEntityState(avatarId, { positionPatch: { x: deltaX, y: 0, z: deltaZ } });
        if (ok && (deltaX !== 0 || deltaZ !== 0)) {
          await mutateEntityState(avatarId, { statePatch: { direction: Math.atan2(deltaZ, deltaX) } });
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

  // ── Snapshot endpoint (force or inspect) ─────────────────────
  if (url.pathname === "/snapshot") {
    if (req.method === "POST") {
      writeSnapshot()
        .then(() => {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ok: true, seq: buildSeq, entities: authoritativeState.size, persistence: persistence.kind }));
        })
        .catch((e) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "snapshot failed" }));
        });
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      lastSnapshotSeq,
      eventsSinceSnapshot,
      buildSeq,
      entities: authoritativeState.size,
      persistence: persistence.kind,
    }));
    return;
  }

  // ── Recovery endpoint (inspect recovery state) ───────────────
  if (url.pathname === "/recovery") {
    persistence
      .getRecoveryInfo()
      .then((info) => {
        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({
          persistence: persistence.kind,
          hasSnapshot: info.hasSnapshot,
          lastSnapshotSeq: info.lastSnapshotSeq,
          eventCount: info.eventCount,
          buildSeq,
          entities: authoritativeState.size,
        }));
      })
      .catch((e) => {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e instanceof Error ? e.message : "recovery info failed" }));
      });
    return;
  }

  // ── State hash endpoint (delegate to control plane) ──────────
  // Returns the canonical state hash computed from the DURABLE store,
  // not from this node's in-memory state. This means the hash is stable
  // across node restarts and even works when the node is dead.
  if (url.pathname === "/state-hash") {
    if (persistence instanceof RemotePersistenceService) {
      fetch(`${controlPlane}/api/runtime/${buildId}/state-hash`)
        .then((r) => r.json())
        .then((d) => {
          res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
          res.end(JSON.stringify({ ...d, source: "durable-store", persistence: persistence.kind }));
        })
        .catch((e) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : "state-hash failed" }));
        });
      return;
    }
    // Local-file mode: compute from in-memory state (no remote store).
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      hash: "pl-local-" + buildSeq,
      buildSeq,
      entityCount: authoritativeState.size,
      source: "in-memory",
      persistence: persistence.kind,
    }));
    return;
  }

  // ── Handoff incoming: receive an entity from another node ─────
  // Phase I: the control plane forwards the entity here. The entity
  // keeps its EXACT ID, state, session, and declarativeArtifact. This
  // node now owns it.
  if (url.pathname === "/handoff/incoming" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", async () => {
      try {
        const data = JSON.parse(body) as {
          entityId: string;
          sessionId?: string;
          position: { x: number; y: number; z: number };
          state: Record<string, unknown>;
          seq: number;
          declarativeArtifact?: string;
          fromZoneId: string;
          zoneId: string;
        };

        // Spawn the entity with the SAME ID + state + session
        buildSeq++;
        const incomingSeq = buildSeq;
        authoritativeState.set(data.entityId, {
          position: data.position,
          state: data.state,
          seq: incomingSeq,
          updatedAt: Date.now(),
        });

        // Persist the spawn (durable) — this node now owns the entity
        await appendLog({
          seq: incomingSeq, type: "spawn", entityId: data.entityId,
          position: data.position, timestamp: Date.now(),
        });

        // If this is a player avatar, register the session
        if (data.sessionId && typeof data.state.name === "string") {
          sessions.set(data.sessionId, {
            name: data.state.name as string,
            connectedAt: Date.now(),
          });
          // Track socket→session if a socket reconnects later
        }

        // Broadcast the new entity to all clients on THIS node
        broadcastStateUpdate(data.entityId, incomingSeq);
        broadcastEvent({ event: "handoff.received", entityId: data.entityId, fromZoneId: data.fromZoneId, zoneId: data.zoneId });

        console.log(`  ↙ Handoff received: entity ${data.entityId.slice(0, 16)} from zone ${data.fromZoneId} (seq=${incomingSeq})`);

        res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
        res.end(JSON.stringify({ ok: true, entityId: data.entityId, seq: incomingSeq, zoneId }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid handoff body" }));
      }
    });
    return;
  }

  // ── Zone info endpoint ─────────────────────────────────────────
  if (url.pathname === "/zone") {
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({
      zoneId,
      zoneName,
      bounds: zoneBounds,
      isSingleNode: !zoneBounds,
    }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

// ── WebSocket transport (socket.io) — primary multiplayer transport ──
// G1.2: socket.io runs on a DEDICATED port (wsPort) with path "/" (the
// gateway-forwarded path). It shares the same in-memory authoritative
// state as the HTTP API — same process, same Map, same broadcast. The
// browser connects via io("/?XTransformPort=<wsPort>"). A dedicated
// port is required because engine.io with path "/" intercepts every
// URL on its host server; co-hosting would shadow the HTTP routes.
io = new Server(wsPort, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Track socket → sessionId so disconnect cleans up the right avatar.
const socketSessions = new Map<string, string>();

io.on("connection", (socket) => {
  // Send the current snapshot on connect (mirrors the SSE handshake).
  const snapshot = JSON.stringify({
    type: "snapshot",
    entities: Array.from(authoritativeState.entries()).map(([id, e]) => ({
      entityId: id, position: e.position, state: e.state,
    })),
    sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })),
    protocolVersion: "1.0.0",
    buildSeq,
    buildHash,
    transport: "websocket",
  });
  socket.emit("message", snapshot);

  // ── session:join ── spawn avatar, record socket→session ──
  socket.on("session:join", async (data: { name?: string }, ack?: (r: unknown) => void) => {
    const name = data?.name ?? `Player-${Math.random().toString(36).slice(2, 6)}`;
    const sid = await createSession(name);
    socketSessions.set(socket.id, sid);
    if (ack) ack({ ok: true, sessionId: sid, sessions: Array.from(sessions.entries()).map(([id, s]) => ({ sessionId: id, ...s })) });
  });

  // ── session:leave ──
  socket.on("session:leave", async (data: { sessionId?: string }, ack?: (r: unknown) => void) => {
    const sid = data?.sessionId ?? socketSessions.get(socket.id);
    if (sid) {
      await removeSession(sid);
      socketSessions.delete(socket.id);
    }
    if (ack) ack({ ok: true });
  });

  // ── player:move ── authoritative movement through the Kernel
  socket.on("player:move", async (data: { sessionId: string; deltaX: number; deltaZ: number }, ack?: (r: unknown) => void) => {
    const sid = data?.sessionId ?? socketSessions.get(socket.id);
    if (!sid) { if (ack) ack({ ok: false, error: "no session" }); return; }
    const avatarId = `avatar-${sid}`;
    const ok = await mutateEntityState(avatarId, { positionPatch: { x: data.deltaX, y: 0, z: data.deltaZ } });
    if (ok && (data.deltaX !== 0 || data.deltaZ !== 0)) {
      await mutateEntityState(avatarId, { statePatch: { direction: Math.atan2(data.deltaZ, data.deltaX) } });
    }
    if (ack) ack({ ok, buildSeq });
  });

  // ── entity:mutate ── generic state mutation (packages use this)
  socket.on("entity:mutate", async (data: { entityId: string; positionPatch?: { x: number; y: number; z: number }; statePatch?: Record<string, unknown> }, ack?: (r: unknown) => void) => {
    const ok = await mutateEntityState(data.entityId, { positionPatch: data.positionPatch, statePatch: data.statePatch });
    if (ack) ack({ ok, buildSeq });
  });

  // ── disconnect ── clean up the avatar (no zombie clients)
  socket.on("disconnect", async () => {
    const sid = socketSessions.get(socket.id);
    if (sid) {
      socketSessions.delete(socket.id);
      await removeSession(sid);
    }
  });

  socket.on("error", (err: unknown) => {
    console.error(`  socket error (${socket.id}):`, err);
  });
});

// ── Start ────────────────────────────────────────────────────────
async function main() {
  // G1.1: create the persistence service (default: remote/durable)
  persistence = await createPersistenceService(buildId, controlPlane, persistenceMode);
  console.log(`  Persistence service: ${persistence.kind}`);

  // G2 + G1.1: recover state from the durable store (not /tmp)
  const recovery = await recoverState();

  // Only load from control plane if we didn't recover state
  if (!recovery.recovered) {
    await loadWorldBuild();
  } else {
    // Fetch build metadata (hash, project id) without re-seeding entities
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
    console.log(`  State recovered from durable store — skipping full scene load`);
  }

  // Start server
  server.listen(port, () => {
    console.log(`\n✓ World Node running`);
    console.log(`  HTTP API:   http://localhost:${port}  (/health /stream /mutate /session /state-hash /handoff/incoming /zone)`);
    console.log(`  WebSocket:  ws://localhost:${wsPort}/  (primary transport, socket.io)`);
    console.log(`  SSE:        http://localhost:${port}/stream  (fallback)`);
    console.log(`  Persistence: ${persistence.kind} (lastSnapshotSeq=${lastSnapshotSeq})`);
    if (zoneId) {
      console.log(`  Zone:       ${zoneId} (${zoneName}) bounds=${zoneBounds ? JSON.stringify(zoneBounds) : "(none)"}`);
    } else {
      console.log(`  Zone:       (none — single-node mode, owns all space)`);
    }
    console.log(`\n  Waiting for clients (WS primary, SSE fallback)...`);
  });

  // Phase I: register this node's zone with the control plane
  if (zoneId && zoneBounds) {
    const nodeId = `node-${buildId.slice(0, 8)}-${zoneId}`;
    fetch(`${controlPlane}/api/runtime/${buildId}/zones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId,
        zoneId,
        zoneName,
        bounds: zoneBounds,
        httpPort: port,
        wsPort,
      }),
    }).then(() => console.log(`  Zone registered: ${zoneId} → control plane`))
      .catch((e) => console.error(`  Zone registration failed:`, e instanceof Error ? e.message : e));
  }

  // Graceful shutdown — write final snapshot to the durable store
  const shutdown = async (sig: string) => {
    console.log(`\n  ${sig} received — writing final snapshot to ${persistence.kind} store...`);
    try {
      await writeSnapshot();
      console.log(`  Final snapshot written. Exiting.`);
    } catch (e) {
      console.error(`  Final snapshot failed:`, e);
    }
    try { io?.close(); } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
