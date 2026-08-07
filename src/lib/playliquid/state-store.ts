// ════════════════════════════════════════════════════════════════
// AUTHORITATIVE STATE STORE — the Kernel owns world state
// ════════════════════════════════════════════════════════════════
//
// Phase B: The Kernel is the state authority. Packages define+mutate
// through KernelContext, but the Kernel owns the canonical state.
// The browser reads from this authority; it does not own state.
//
// This store is an in-memory authoritative state cache per World Build.
// It's backed by the DB (Persistence) and pushed to clients via SSE
// (Replication). This is the beginning of the real OS substrate.

import { db } from "@/lib/db";

// In-memory authoritative state per build
// Key: buildId → Map<entityId, { position, state, updatedAt }>
const authoritativeState = new Map<string, Map<string, {
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  updatedAt: number;
}>>();

// SSE subscriber connections per build
// Key: buildId → Set of response writers
const subscribers = new Map<string, Set<(data: string) => void>>();

// Player sessions per build
// Key: buildId → Map<sessionId, { name, connectedAt }>
const sessions = new Map<string, Map<string, { name: string; connectedAt: number }>>();

// ── Initialize authoritative state from the DB ────────────────────
export async function initAuthoritativeState(buildId: string): Promise<void> {
  if (authoritativeState.has(buildId)) return;

  const entities = await db.entity.findMany({
    where: { worldBuildId: buildId },
  });

  const stateMap = new Map<string, { position: { x: number; y: number; z: number }; state: Record<string, unknown>; updatedAt: number }>();
  for (const e of entities) {
    stateMap.set(e.id, {
      position: JSON.parse(e.position),
      state: JSON.parse(e.state),
      updatedAt: Date.now(),
    });
  }
  authoritativeState.set(buildId, stateMap);
}

// ── Read authoritative state ──────────────────────────────────────
export function getAuthoritativeState(buildId: string): Map<string, {
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  updatedAt: number;
}> {
  return authoritativeState.get(buildId) ?? new Map();
}

// ── Mutate authoritative state (the Kernel's job) ─────────────────
// Packages call this via the state mutation API. The Kernel decides
// whether to accept the mutation (capability enforcement).
export function mutateEntityState(
  buildId: string,
  entityId: string,
  mutation: {
    positionPatch?: { x: number; y: number; z: number };
    statePatch?: Record<string, unknown>;
  }
): boolean {
  const stateMap = authoritativeState.get(buildId);
  if (!stateMap) return false;
  const entity = stateMap.get(entityId);
  if (!entity) return false;

  if (mutation.positionPatch) {
    entity.position = {
      x: entity.position.x + mutation.positionPatch.x,
      y: entity.position.y + mutation.positionPatch.y,
      z: entity.position.z + mutation.positionPatch.z,
    };
  }
  if (mutation.statePatch) {
    entity.state = { ...entity.state, ...mutation.statePatch };
  }
  entity.updatedAt = Date.now();

  // Replicate to all connected clients via SSE
  broadcastStateUpdate(buildId, entityId);
  return true;
}

// ── The scheduler tick — mutates authoritative state server-side ──
// This is the REAL Kernel scheduler. It runs on the server, not in
// the browser. It ticks every entity's position slightly (a toy physics
// simulation) and replicates the changes to all clients.
export function schedulerTick(buildId: string): number {
  const stateMap = authoritativeState.get(buildId);
  if (!stateMap) return 0;

  let updated = 0;
  for (const [entityId, entity] of stateMap.entries()) {
    // Apply any pending movement from packages
    const pending = (entity.state.pendingMovement as { x: number; y: number; z: number }) ?? null;
    if (pending) {
      entity.position = {
        x: entity.position.x + pending.x,
        y: entity.position.y + pending.y,
        z: entity.position.z + pending.z,
      };
      // Clear pending movement
      entity.state = { ...entity.state, pendingMovement: undefined };
      entity.updatedAt = Date.now();
      broadcastStateUpdate(buildId, entityId);
      updated++;
    }

    // Apply package-driven state changes (rotation, etc.)
    // The packages update their own state through the mutation API;
    // the scheduler just replicates it.
    const spinSpeed = (entity.state.spinSpeed as number) ?? null;
    if (spinSpeed !== null) {
      const rotation = ((entity.state.rotation as number) ?? 0) + spinSpeed;
      entity.state = { ...entity.state, rotation };
      entity.updatedAt = Date.now();
      broadcastStateUpdate(buildId, entityId);
      updated++;
    }
  }

  return updated;
}

// ── SSE: subscribe to state updates ───────────────────────────────
export function subscribe(buildId: string, writer: (data: string) => void): () => void {
  if (!subscribers.has(buildId)) subscribers.set(buildId, new Set());
  subscribers.get(buildId)!.add(writer);
  return () => {
    subscribers.get(buildId)?.delete(writer);
  };
}

// ── SSE: broadcast a state update to all subscribers ──────────────
function broadcastStateUpdate(buildId: string, entityId: string): void {
  const stateMap = authoritativeState.get(buildId);
  if (!stateMap) return;
  const entity = stateMap.get(entityId);
  if (!entity) return;

  const update = JSON.stringify({
    type: "state",
    entityId,
    position: entity.position,
    state: entity.state,
    updatedAt: entity.updatedAt,
  });

  const subs = subscribers.get(buildId);
  if (subs) {
    for (const writer of subs) {
      try { writer(update); } catch { /* client disconnected */ }
    }
  }
}

// ── Broadcast a generic event (player join, capability invoke, etc.) ──
export function broadcastEvent(buildId: string, event: { type: string; [key: string]: unknown }): void {
  const data = JSON.stringify({ type: "event", ...event });
  const subs = subscribers.get(buildId);
  if (subs) {
    for (const writer of subs) {
      try { writer(data); } catch { /* client disconnected */ }
    }
  }
}

// ── Session management ────────────────────────────────────────────
export function createSession(buildId: string, name: string): string {
  if (!sessions.has(buildId)) sessions.set(buildId, new Map());
  const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sessions.get(buildId)!.set(sessionId, { name, connectedAt: Date.now() });
  broadcastEvent(buildId, { event: "session.join", sessionId, name });
  return sessionId;
}

export function removeSession(buildId: string, sessionId: string): void {
  const session = sessions.get(buildId)?.get(sessionId);
  sessions.get(buildId)?.delete(sessionId);
  if (session) {
    broadcastEvent(buildId, { event: "session.leave", sessionId, name: session.name });
  }
}

export function getSessions(buildId: string): Array<{ sessionId: string; name: string; connectedAt: number }> {
  const map = sessions.get(buildId);
  if (!map) return [];
  return Array.from(map.entries()).map(([sessionId, val]) => ({ sessionId, ...val }));
}
