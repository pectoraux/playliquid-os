import { NextRequest, NextResponse } from "next/server";
import { registerNode, unregisterNode, getZones, findNodeForPosition } from "@/lib/playliquid/zone-registry";

export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────
// ZONE REGISTRY — spatial ownership for distributed World Nodes.
//
//   POST /api/runtime/:buildId/zones   a node registers itself for a zone
//   GET  /api/runtime/:buildId/zones   list all zones (+ which node owns each)
//   GET  /api/runtime/:buildId/zones?x=&z=   find the node owning a position
//
// A zone is a spatial bounding box. Each zone is owned by exactly one
// World Node. When a player crosses a boundary, the handoff coordinator
// uses this registry to find the target node.
// ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  let body: {
    nodeId: string;
    zoneId: string;
    zoneName: string;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    httpPort: number;
    wsPort: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.nodeId || !body.zoneId || !body.bounds) {
    return NextResponse.json({ error: "nodeId, zoneId, bounds are required" }, { status: 400 });
  }

  const controlPlane = `http://127.0.0.1:${body.httpPort > 0 ? 3000 : 3000}`;
  registerNode(buildId, {
    nodeId: body.nodeId,
    zoneId: body.zoneId,
    zoneName: body.zoneName ?? body.zoneId,
    bounds: body.bounds,
    httpPort: body.httpPort,
    wsPort: body.wsPort,
    httpUrl: `http://127.0.0.1:${body.httpPort}`,
    wsUrl: `http://127.0.0.1:${body.wsPort}`,
    registeredAt: Date.now(),
  });

  return NextResponse.json({ ok: true, buildId, zoneId: body.zoneId, nodeId: body.nodeId });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const url = new URL(req.url);
  const x = url.searchParams.get("x");
  const z = url.searchParams.get("z");

  // If x,z provided, find the node owning that position
  if (x !== null && z !== null) {
    const node = findNodeForPosition(buildId, parseFloat(x), parseFloat(z));
    return NextResponse.json({ buildId, position: { x: parseFloat(x), z: parseFloat(z) }, node });
  }

  const zones = getZones(buildId);
  return NextResponse.json({ buildId, zones, count: zones.length });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const url = new URL(req.url);
  const zoneId = url.searchParams.get("zoneId");
  if (!zoneId) {
    return NextResponse.json({ error: "zoneId query param required" }, { status: 400 });
  }
  unregisterNode(buildId, zoneId);
  return NextResponse.json({ ok: true, buildId, zoneId });
}
