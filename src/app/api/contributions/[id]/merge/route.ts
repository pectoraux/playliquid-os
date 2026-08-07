import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapContribution } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// POST /api/contributions/:id/merge — maintainer merges a contribution
// (binds the package to the world project's manifest)
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c = await db.contribution.findUnique({ where: { id } });
  if (!c) return NextResponse.json({ error: "Contribution not found" }, { status: 404 });
  if (c.status !== "PENDING") {
    return NextResponse.json({ error: `Already ${c.status}` }, { status: 400 });
  }

  // If the contribution has a package, add it to the project's manifest
  if (c.packageId) {
    const project = await db.worldProject.findUnique({ where: { id: c.worldProjectId } });
    if (project) {
      const manifest = JSON.parse(project.packageManifest) as string[];
      const pkg = await db.package.findUnique({ where: { id: c.packageId } });
      if (pkg && !manifest.includes(pkg.name)) {
        manifest.push(pkg.name);
        await db.worldProject.update({
          where: { id: c.worldProjectId },
          data: { packageManifest: JSON.stringify(manifest) },
        });
      }
    }
  }

  const updated = await db.contribution.update({
    where: { id },
    data: { status: "MERGED", reviewedAt: new Date(), reviewedBy: "maintainer" },
    include: { package: { include: { provides: true, requires: true } } },
  });
  return NextResponse.json(mapContribution(updated));
}
