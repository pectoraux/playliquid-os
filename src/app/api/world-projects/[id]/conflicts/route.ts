import { NextRequest, NextResponse } from "next/server";
import { detectSpatialConflicts, extractSpatialContract, type PackageSpatialContract } from "@/lib/playliquid/services/world-project-compiler";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/world-projects/[id]/conflicts — detect spatial conflicts between merged contributions
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const contributions = await db.contribution.findMany({
    where: { worldProjectId: id, status: "MERGED" },
    include: { package: true },
  });

  const contracts: PackageSpatialContract[] = [];
  for (const c of contributions) {
    if (!c.package) continue;
    const manifest = JSON.parse(c.package.manifest);
    const artifact = manifest?.artifact ?? null;
    contracts.push(extractSpatialContract(c.package.name, artifact, c.package.id));
  }

  const result = detectSpatialConflicts(contracts);
  return NextResponse.json({ worldProjectId: id, contributionCount: contracts.length, ...result });
}
