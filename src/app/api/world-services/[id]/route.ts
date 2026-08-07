import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldService, mapWorldServiceBinding } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// POST /api/world-services/:id — bind a service to a world project
// body: { worldProjectId, enabled?, config? }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const worldProjectId: string = body.worldProjectId;
  if (!worldProjectId) return NextResponse.json({ error: "worldProjectId required" }, { status: 400 });

  const binding = await db.worldServiceBinding.upsert({
    where: { worldProjectId_worldServiceId: { worldProjectId, worldServiceId: id } },
    update: { enabled: body.enabled ?? true, config: JSON.stringify(body.config ?? {}) },
    create: {
      worldProjectId,
      worldServiceId: id,
      enabled: body.enabled ?? true,
      config: JSON.stringify(body.config ?? {}),
    },
    include: { worldService: true },
  });
  return NextResponse.json(mapWorldServiceBinding(binding));
}
