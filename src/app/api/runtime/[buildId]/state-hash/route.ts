import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// CANONICAL STATE HASH — reconstructs the world state from the durable
// store (latest snapshot + replay of post-snapshot events) and returns
// a deterministic hash. This is the acceptance-test oracle: a fresh
// node on a clean machine must produce the SAME hash after recovery.
//
//   GET /api/runtime/:buildId/state-hash
//
// The hash is computed over a canonical serialization:
//   - entities sorted by entityId
//   - each entity: { entityId, position (rounded), state (sorted keys), seq }
//   - buildSeq
//
// This route does NOT depend on the World Node process — it reads the
// durable store directly. So it works even when the node is dead,
// which is exactly when the acceptance test needs it.
// ─────────────────────────────────────────────────────────────────

interface EntityState {
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
  seq: number;
}

interface LogEntry {
  seq: number;
  type: string;
  entityId?: string;
  position?: { x: number; y: number; z: number };
  positionPatch?: { x: number; y: number; z: number };
  statePatch?: Record<string, unknown>;
  timestamp?: number;
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function canonicalStateHash(
  entities: Map<string, EntityState>,
  buildSeq: number
): string {
  const ids = Array.from(entities.keys()).sort();
  const parts: string[] = [`buildSeq=${buildSeq}`];
  for (const id of ids) {
    const e = entities.get(id)!;
    const stateKeys = Object.keys(e.state).sort();
    const stateStr = stateKeys
      .filter((k) => k !== "declarativeArtifact") // large text, hashed separately if needed
      .map((k) => `${k}=${JSON.stringify(e.state[k])}`)
      .join(",");
    parts.push(
      `${id}|p=${round(e.position.x)},${round(e.position.y)},${round(e.position.z)}|s={${stateStr}}|seq=${e.seq}`
    );
  }
  const canonical = parts.join("\n");
  // FNV-1a 64-bit-ish hash over the canonical string (no crypto dep needed,
  // deterministic and stable across processes/machines).
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < canonical.length; i++) {
    const c = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  const hash = (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
  return `pl-${hash}`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  try {
    // 1. Load latest snapshot
    const snapshot = await db.worldSnapshot.findFirst({
      where: { buildId },
      orderBy: { seq: "desc" },
    });

    const entities = new Map<string, EntityState>();
    let buildSeq = 0;
    let lastSnapshotSeq = -1;

    if (snapshot) {
      const data = (() => {
        try { return JSON.parse(snapshot.data); } catch { return {}; }
      })();
      buildSeq = data.buildSeq ?? 0;
      lastSnapshotSeq = snapshot.seq;
      for (const e of (data.entities ?? [])) {
        entities.set(e.entityId, {
          position: e.position,
          state: e.state,
          seq: e.seq,
        });
      }
    }

    // 2. Replay events after the snapshot
    const events = await db.worldEvent.findMany({
      where: snapshot ? { buildId, seq: { gt: snapshot.seq } } : { buildId },
      orderBy: { seq: "asc" },
      select: { seq: true, type: true, entityId: true, payload: true },
    });

    for (const r of events) {
      const entry = (() => {
        try { return JSON.parse(r.payload) as LogEntry; } catch { return {} as LogEntry; }
      })();
      entry.seq = r.seq;
      entry.type = r.type;
      entry.entityId = r.entityId ?? undefined;

      if (entry.type === "spawn") {
        entities.set(entry.entityId!, {
          position: entry.position!,
          state: {},
          seq: entry.seq,
        });
      } else if (entry.type === "mutate") {
        const entity = entities.get(entry.entityId!);
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
        }
      } else if (entry.type === "remove") {
        entities.delete(entry.entityId!);
      }
      buildSeq = Math.max(buildSeq, entry.seq);
    }

    const hash = canonicalStateHash(entities, buildSeq);

    return NextResponse.json({
      buildId,
      hash,
      buildSeq,
      entityCount: entities.size,
      hasSnapshot: !!snapshot,
      lastSnapshotSeq,
      eventCount: events.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to compute state hash" },
      { status: 500 }
    );
  }
}
