// ════════════════════════════════════════════════════════════════
// ZONE REGISTRY — spatial ownership for distributed World Nodes
// ════════════════════════════════════════════════════════════════
//
// Phase I: A World is divided into spatial zones. Each zone is owned by
// exactly one World Node. When a player crosses a zone boundary, their
// entity is handed off to the target node — same entity ID, same state,
// same session, same package. The player never knows.
//
// This is an in-memory registry (the control plane's view of the world).
// Nodes register on startup; clients + nodes query to find who owns a
// position.

export interface ZoneBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface NodeRegistration {
  nodeId: string;
  zoneId: string;
  zoneName: string;
  bounds: ZoneBounds;
  httpPort: number;
  wsPort: number;
  httpUrl: string;
  wsUrl: string;
  registeredAt: number;
}

// buildId → zoneId → NodeRegistration
const registry = new Map<string, Map<string, NodeRegistration>>();

function getBuildMap(buildId: string): Map<string, NodeRegistration> {
  let m = registry.get(buildId);
  if (!m) {
    m = new Map();
    registry.set(buildId, m);
  }
  return m;
}

export function registerNode(buildId: string, reg: NodeRegistration): void {
  const m = getBuildMap(buildId);
  m.set(reg.zoneId, reg);
}

export function unregisterNode(buildId: string, zoneId: string): void {
  const m = registry.get(buildId);
  if (m) m.delete(zoneId);
}

export function getZones(buildId: string): NodeRegistration[] {
  const m = registry.get(buildId);
  return m ? Array.from(m.values()) : [];
}

export function findNodeForPosition(buildId: string, x: number, z: number): NodeRegistration | null {
  const m = registry.get(buildId);
  if (!m) return null;
  for (const reg of m.values()) {
    if (x >= reg.bounds.minX && x < reg.bounds.maxX &&
        z >= reg.bounds.minZ && z < reg.bounds.maxZ) {
      return reg;
    }
  }
  return null;
}

export function findNodeByZone(buildId: string, zoneId: string): NodeRegistration | null {
  const m = registry.get(buildId);
  if (!m) return null;
  return m.get(zoneId) ?? null;
}

// ── Handoff log (audit trail of entity transfers between nodes) ──
export interface HandoffRecord {
  entityId: string;
  sessionId?: string;
  fromZoneId: string;
  toZoneId: string;
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  seq: number;
  timestamp: number;
}

const handoffLog: HandoffRecord[] = [];

export function recordHandoff(record: HandoffRecord): void {
  handoffLog.push(record);
  // Keep the log bounded
  if (handoffLog.length > 1000) handoffLog.shift();
}

export function getHandoffLog(): HandoffRecord[] {
  return [...handoffLog];
}
