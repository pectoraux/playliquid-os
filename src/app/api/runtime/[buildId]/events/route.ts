import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// DURABLE EVENT STORE — control-plane backing for the World Node's
// PersistenceService. This is the `kernel.persistence` contract made
// real: every authoritative state mutation the World Node acknowledges
// is appended here BEFORE the node replies to the client, so a node
// crash never loses a committed mutation.
//
//   POST /api/runtime/:buildId/events   append one event (durable)
//   GET  /api/runtime/:buildId/events?afterSeq=N  read events with seq > N
//
// The node owns the monotonic seq; this store is an append-only log
// indexed by (buildId, seq). Recovery = read latest snapshot, then
// read all events with seq > snapshot.seq and replay them.
// ─────────────────────────────────────────────────────────────────

// POST — append a single event to the durable log.
export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  let body: {
    seq: number;
    type: string;
    entityId?: string;
    payload?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.seq !== "number" || typeof body.type !== "string") {
    return NextResponse.json({ error: "seq (number) and type (string) are required" }, { status: 400 });
  }

  try {
    // Idempotent append: (buildId, seq) is unique. If this seq already
    // exists (e.g. node retried after a crash), return the existing row
    // instead of duplicating — this gives exactly-once durable semantics
    // even under node retries.
    const existing = await db.worldEvent.findUnique({
      where: { buildId_seq: { buildId, seq: body.seq } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id, seq: existing.seq, duplicate: true });
    }

    const row = await db.worldEvent.create({
      data: {
        buildId,
        seq: body.seq,
        type: body.type,
        entityId: body.entityId ?? null,
        payload: JSON.stringify(body.payload ?? {}),
      },
    });
    return NextResponse.json({ ok: true, id: row.id, seq: row.seq });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to append event" },
      { status: 500 }
    );
  }
}

// GET — read events from the durable log.
//   ?afterSeq=N  → events with seq strictly greater than N (for replay-after-snapshot)
//   (no param)   → all events for this build (full replay from zero)
export async function GET(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const url = new URL(req.url);
  const afterSeqParam = url.searchParams.get("afterSeq");
  const afterSeq = afterSeqParam !== null ? parseInt(afterSeqParam, 10) : -1;

  try {
    const rows = await db.worldEvent.findMany({
      where: afterSeq >= 0 ? { buildId, seq: { gt: afterSeq } } : { buildId },
      orderBy: { seq: "asc" },
      select: { seq: true, type: true, entityId: true, payload: true, createdAt: true },
    });

    const entries = rows.map((r) => ({
      seq: r.seq,
      type: r.type,
      entityId: r.entityId ?? undefined,
      payload: (() => {
        try { return JSON.parse(r.payload); } catch { return {}; }
      })(),
      timestamp: r.createdAt.getTime(),
    }));

    return NextResponse.json({ buildId, afterSeq, entries, count: entries.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to read events" },
      { status: 500 }
    );
  }
}

// DELETE — purge all durable state (events + snapshots) for a build.
// Used by the durability acceptance test to start from a clean slate.
// This is the only destructive operation on the event store.
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  try {
    const delEvents = await db.worldEvent.deleteMany({ where: { buildId } });
    const delSnaps = await db.worldSnapshot.deleteMany({ where: { buildId } });
    return NextResponse.json({ ok: true, buildId, deletedEvents: delEvents.count, deletedSnapshots: delSnaps.count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to purge" },
      { status: 500 }
    );
  }
}
