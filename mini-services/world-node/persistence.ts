// ════════════════════════════════════════════════════════════════
// PLAYLIQUID PERSISTENCE SERVICE — the `kernel.persistence` OS contract
// ════════════════════════════════════════════════════════════════
//
// Phase G.1: The World Node does NOT own its filesystem for state
// durability. It talks to a PersistenceService — an OS contract that
// hides whether the backend is Postgres, S3, Redis, object storage, or
// a local disk. The node only knows: append events, read events, write
// snapshots, read the latest snapshot.
//
//   World Node
//      │
//      ├── Authority (in-memory)
//      ├── Sessions
//      ├── Replication (SSE)
//      └── PersistenceService  ◄── THIS FILE (the contract)
//               │
//        ┌──────┴───────┐
//        │              │
//   RemoteStore     LocalFileStore
//   (HTTP → CP       (fs /tmp —
//    → Postgres)      fallback only)
//
// The REMOTE store is the default and the source of truth. A World Node
// can be killed (-9), its /tmp destroyed, and a fresh node on a clean
// machine recovers the exact world state from the remote store. THAT is
// the durability guarantee — persistence belongs to the OS, not the
// machine the node happened to run on.

import { writeFileSync, readFileSync, existsSync, appendFileSync, mkdirSync } from "fs";
import { dirname } from "path";

// ── Types ────────────────────────────────────────────────────────

export interface LogEntry {
  seq: number;
  type: string; // "spawn" | "mutate" | "remove" | "session.join" | "session.leave"
  entityId?: string;
  position?: { x: number; y: number; z: number };
  positionPatch?: { x: number; y: number; z: number };
  statePatch?: Record<string, unknown>;
  timestamp: number;
}

export interface SnapshotData {
  buildSeq: number;
  seq: number; // the buildSeq at which this snapshot was taken
  entities: Array<{
    entityId: string;
    position: { x: number; y: number; z: number };
    state: Record<string, unknown>;
    seq: number;
  }>;
  sessions: Array<{ sessionId: string; name: string; connectedAt: number }>;
  timestamp: number;
}

export interface RecoveryInfo {
  hasSnapshot: boolean;
  lastSnapshotSeq: number;
  eventCount: number;
}

// ── The OS contract ──────────────────────────────────────────────

export interface PersistenceService {
  /** Identifies the backend implementation ("remote" | "local-file"). */
  readonly kind: string;

  /** Append a single event to the durable log. Must be synchronous-w.r.t.
   *  durability: when this resolves, the event survives a node crash. */
  appendEvent(entry: LogEntry): Promise<void>;

  /** Read every event with seq strictly greater than `seq`. */
  readEventsAfter(seq: number): Promise<LogEntry[]>;

  /** Read every event for this build (full replay from zero). */
  readAllEvents(): Promise<LogEntry[]>;

  /** Write a full-state checkpoint at the given seq. */
  writeSnapshot(snapshot: SnapshotData): Promise<void>;

  /** Read the latest checkpoint (highest seq), or null if none. */
  readLatestSnapshot(): Promise<SnapshotData | null>;

  /** Inspect what recovery would load (does not mutate state). */
  getRecoveryInfo(): Promise<RecoveryInfo>;
}

// ════════════════════════════════════════════════════════════════
// REMOTE PERSISTENCE SERVICE — HTTP → control plane → durable DB.
// This is the production default. The node never touches /tmp.
// ════════════════════════════════════════════════════════════════

export class RemotePersistenceService implements PersistenceService {
  readonly kind = "remote";

  constructor(
    private readonly buildId: string,
    private readonly controlPlane: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private eventsUrl() {
    return `${this.controlPlane}/api/runtime/${this.buildId}/events`;
  }
  private snapshotUrl() {
    return `${this.controlPlane}/api/runtime/${this.buildId}/snapshot`;
  }

  async appendEvent(entry: LogEntry): Promise<void> {
    const res = await this.fetchImpl(this.eventsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seq: entry.seq,
        type: entry.type,
        entityId: entry.entityId,
        payload: {
          position: entry.position,
          positionPatch: entry.positionPatch,
          statePatch: entry.statePatch,
          timestamp: entry.timestamp,
        },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`RemotePersistence.appendEvent HTTP ${res.status}: ${txt}`);
    }
    // The control plane dedups on (buildId, seq), so retries are safe.
  }

  async readEventsAfter(seq: number): Promise<LogEntry[]> {
    const res = await this.fetchImpl(`${this.eventsUrl()}?afterSeq=${seq}`);
    if (!res.ok) throw new Error(`RemotePersistence.readEventsAfter HTTP ${res.status}`);
    const data = await res.json() as { entries: Array<LogEntry & { payload: any }> };
    return data.entries.map((e) => ({
      seq: e.seq,
      type: e.type,
      entityId: e.entityId,
      position: e.payload?.position,
      positionPatch: e.payload?.positionPatch,
      statePatch: e.payload?.statePatch,
      timestamp: e.payload?.timestamp ?? e.timestamp,
    }));
  }

  async readAllEvents(): Promise<LogEntry[]> {
    const res = await this.fetchImpl(this.eventsUrl());
    if (!res.ok) throw new Error(`RemotePersistence.readAllEvents HTTP ${res.status}`);
    const data = await res.json() as { entries: Array<LogEntry & { payload: any }> };
    return data.entries.map((e) => ({
      seq: e.seq,
      type: e.type,
      entityId: e.entityId,
      position: e.payload?.position,
      positionPatch: e.payload?.positionPatch,
      statePatch: e.payload?.statePatch,
      timestamp: e.payload?.timestamp ?? e.timestamp,
    }));
  }

  async writeSnapshot(snapshot: SnapshotData): Promise<void> {
    const res = await this.fetchImpl(this.snapshotUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seq: snapshot.seq,
        entityCount: snapshot.entities.length,
        data: snapshot,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`RemotePersistence.writeSnapshot HTTP ${res.status}: ${txt}`);
    }
  }

  async readLatestSnapshot(): Promise<SnapshotData | null> {
    const res = await this.fetchImpl(this.snapshotUrl());
    if (!res.ok) throw new Error(`RemotePersistence.readLatestSnapshot HTTP ${res.status}`);
    const data = await res.json() as { hasSnapshot: boolean; seq?: number; data?: SnapshotData };
    if (!data.hasSnapshot || !data.data) return null;
    return data.data as SnapshotData;
  }

  async getRecoveryInfo(): Promise<RecoveryInfo> {
    const [snap, events] = await Promise.all([
      this.readLatestSnapshot(),
      this.readAllEvents(),
    ]);
    return {
      hasSnapshot: !!snap,
      lastSnapshotSeq: snap?.seq ?? -1,
      eventCount: events.length,
    };
  }
}

// ════════════════════════════════════════════════════════════════
// LOCAL-FILE PERSISTENCE SERVICE — filesystem fallback.
//
// Used ONLY when the control plane is unreachable or for fully-offline
// dev. This is NOT the source of truth in production — /tmp is
// node-local ephemeral storage and is destroyed when the node's machine
// is recycled. It exists so the node can still run without a control
// plane, but durability is not guaranteed across machine loss.
// ════════════════════════════════════════════════════════════════

export class LocalFilePersistenceService implements PersistenceService {
  readonly kind = "local-file";

  private readonly logFile: string;
  private readonly snapshotFile: string;
  private readonly events: LogEntry[] = [];

  constructor(buildId: string, private readonly dir: string = "/tmp") {
    this.logFile = `${dir}/playliquid-events-${buildId}.log`;
    this.snapshotFile = `${dir}/playliquid-snapshot-${buildId}.json`;
    try { mkdirSync(dir, { recursive: true }); } catch {}
  }

  async appendEvent(entry: LogEntry): Promise<void> {
    this.events.push(entry);
    try {
      appendFileSync(this.logFile, JSON.stringify(entry) + "\n");
    } catch (e) {
      // Best-effort: in-memory log still holds the event for this session.
    }
  }

  async readEventsAfter(seq: number): Promise<LogEntry[]> {
    const all = await this.readAllEvents();
    return all.filter((e) => e.seq > seq);
  }

  async readAllEvents(): Promise<LogEntry[]> {
    try {
      const data = readFileSync(this.logFile, "utf-8");
      return data.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as LogEntry);
    } catch {
      return [];
    }
  }

  async writeSnapshot(snapshot: SnapshotData): Promise<void> {
    try {
      writeFileSync(this.snapshotFile, JSON.stringify(snapshot));
    } catch (e) {
      console.error("  LocalFile snapshot write failed:", e);
    }
  }

  async readLatestSnapshot(): Promise<SnapshotData | null> {
    try {
      const data = JSON.parse(readFileSync(this.snapshotFile, "utf-8"));
      return data as SnapshotData;
    } catch {
      return null;
    }
  }

  async getRecoveryInfo(): Promise<RecoveryInfo> {
    return {
      hasSnapshot: existsSync(this.snapshotFile),
      lastSnapshotSeq: (await this.readLatestSnapshot())?.seq ?? -1,
      eventCount: this.events.length,
    };
  }
}

// ── Factory: pick the backend from a `--persistence` flag ─────────
//
//   --persistence remote       → RemotePersistenceService (default)
//   --persistence local        → LocalFilePersistenceService
//   --persistence auto         → try remote; fall back to local if the
//                                 control plane is unreachable at startup

export async function createPersistenceService(
  buildId: string,
  controlPlane: string,
  mode: "remote" | "local" | "auto" = "remote"
): Promise<PersistenceService> {
  if (mode === "local") {
    return new LocalFilePersistenceService(buildId);
  }

  const remote = new RemotePersistenceService(buildId, controlPlane);

  if (mode === "remote") {
    return remote;
  }

  // auto: probe the control plane; fall back to local if unreachable.
  try {
    const res = await fetch(`${controlPlane}/api/runtime/${buildId}/events`);
    if (res.ok) {
      console.log(`  Persistence: remote (control plane reachable)`);
      return remote;
    }
    throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.log(`  Persistence: local-file FALLBACK (control plane unreachable: ${e instanceof Error ? e.message : e})`);
    return new LocalFilePersistenceService(buildId);
  }
}
