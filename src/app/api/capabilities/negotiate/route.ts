import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapPackage } from "@/lib/playliquid/mappers";
import { negotiateCapabilities } from "@/lib/playliquid/capability-engine";

export const dynamic = "force-dynamic";

// POST /api/capabilities/negotiate
// body: { packageId, worldProjectId, zoneName?, experienceName? }
// Computes the effective capabilities for an entity (from its package) in
// the given world/zone/experience context. This is the Superman example:
// the package stays reusable; the world layers policies on top.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { packageId, worldProjectId, zoneName, experienceName } = body;
  if (!packageId || !worldProjectId) {
    return NextResponse.json({ error: "packageId and worldProjectId are required" }, { status: 400 });
  }

  const pkg = await db.package.findUnique({
    where: { id: packageId },
    include: { provides: true, requires: true },
  });
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  const effective = await negotiateCapabilities({
    pkg: mapPackage(pkg),
    worldProjectId,
    zoneName,
    experienceName,
  });

  return NextResponse.json({
    package: mapPackage(pkg),
    declared: mapPackage(pkg).capabilities,
    effective,
  });
}
