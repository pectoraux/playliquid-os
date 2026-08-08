import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// DURABLE SNAPSHOT STORE — control-plane backing for the World Node's
// PersistenceService. A snapshot is a full-state checkpoint at a given
// buildSeq. Recovery loads the latest snapshot, then replays events
// with seq > snapshot.seq.
//
//   POST /api/runtime/:buildId/snapshot   write a checkpoint
//   GET  /api/runtime/:buildId/snapshot   read the latest checkpoint
//
// Snapshots bound the replay cost: without them, recovery would replay
// the entire event history. They are written periodically (every N
// events), on graceful shutdown, and on explicit /snapshot POST.
// ─────────────────────────────────────────────────────────────────

// POST — write a snapshot checkpoint.
export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  let body: {
    seq: number;
    entityCount: number;
    data: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.seq !== "number" || typeof body.data !== "object") {
    return NextResponse.json({ error: "seq (number) and data (object) are required" }, { status: 400 });
  }

  try {
    // Keep all snapshots (audit trail) but the latest by seq is what
    // recovery reads. A small build only ever needs the newest.
    const row = await db.worldSnapshot.create({
      data: {
        buildId,
        seq: body.seq,
        entityCount: body.entityCount ?? 0,
        data: JSON.stringify(body.data ?? {}),
      },
    });
    return NextResponse.json({ ok: true, id: row.id, seq: row.seq, entityCount: row.entityCount });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to write snapshot" },
      { status: 500 }
    );
  }
}

// GET — read the latest snapshot for this build (highest seq).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  try {
    const row = await db.worldSnapshot.findFirst({
      where: { buildId },
      orderBy: { seq: "desc" },
    });
    if (!row) {
      return NextResponse.json({ buildId, hasSnapshot: false });
    }
    return NextResponse.json({
      buildId,
      hasSnapshot: true,
      seq: row.seq,
      entityCount: row.entityCount,
      data: (() => {
        try { return JSON.parse(row.data); } catch { return {}; }
      })(),
      timestamp: row.createdAt.getTime(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed to read snapshot" },
      { status: 500 }
    );
  }
}
