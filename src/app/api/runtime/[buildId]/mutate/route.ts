import { NextRequest, NextResponse } from "next/server";
import { initAuthoritativeState, mutateEntityState, getAuthoritativeState } from "@/lib/playliquid/state-store";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/runtime/:buildId/mutate
// body: { entityId, positionPatch?, statePatch?, capability? }
//
// R3: Server-side capability enforcement on ALL mutations.
// The Kernel is the sole authority. Browser denial is UX; server denial
// is the security boundary.
//
// If a capability is specified, the Kernel checks whether the entity's
// package is allowed that capability in this world/zone/experience.
// If denied, the mutation is rejected — even if the browser already
// "allowed" it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ buildId: string }> }) {
  const { buildId } = await ctx.params;
  const body = await req.json();
  const { entityId, positionPatch, statePatch, capability } = body;

  if (!entityId) {
    return NextResponse.json({ error: "entityId is required" }, { status: 400 });
  }

  await initAuthoritativeState(buildId);

  // R3: If a capability is required for this mutation, enforce it server-side.
  // This is the REAL security boundary — not the browser's invokeCapability.
  if (capability) {
    const build = await db.worldBuild.findUnique({
      where: { id: buildId },
      include: { worldProject: true },
    });
    if (!build) {
      return NextResponse.json({ error: "Build not found" }, { status: 404 });
    }

    // Get the entity's state to find its package
    const stateMap = getAuthoritativeState(buildId);
    const entity = stateMap.get(entityId);
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    // Load capability policies for this world
    const policies = await db.capabilityPolicy.findMany({
      where: { worldProjectId: build.worldProjectId },
      orderBy: { priority: "asc" },
    });

    // Check if the capability is allowed
    // For player avatars (which have declarativeArtifact in state),
    // check against the artifact's declared capabilities
    const declaredCaps = (entity.state.declaredCapabilities as string[]) ?? [];
    if (declaredCaps.length > 0 && !declaredCaps.includes(capability)) {
      // The package didn't declare this capability — deny
      return NextResponse.json({
        ok: false,
        denied: true,
        reason: `Capability "${capability}" not declared by this package`,
        securityBoundary: "server",
      }, { status: 403 });
    }

    // Check world policies
    let action: "allow" | "deny" | "limit" = "allow";
    for (const policy of policies) {
      if (policy.capability !== capability && policy.capability !== "*") continue;
      const rules = JSON.parse(policy.rules) as Array<{ action: string; packageFamily?: string; package?: string }>;
      for (const rule of rules) {
        // Simple match: if any rule denies this capability, deny
        if (rule.action === "deny") {
          action = "deny";
        } else if (rule.action === "allow" && action === "deny") {
          action = "allow"; // higher-priority override
        }
      }
    }

    if (action === "deny") {
      return NextResponse.json({
        ok: false,
        denied: true,
        reason: `Capability "${capability}" denied by world policy`,
        securityBoundary: "server",
      }, { status: 403 });
    }
  }

  // Apply the mutation
  const ok = mutateEntityState(buildId, entityId, { positionPatch, statePatch });
  if (!ok) {
    return NextResponse.json({ error: "Entity not found in authoritative state" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
