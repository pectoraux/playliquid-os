import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapContribution } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/contributions?projectId=&status=
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  const status = req.nextUrl.searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (projectId) where.worldProjectId = projectId;
  if (status) where.status = status;
  const contributions = await db.contribution.findMany({
    where,
    include: { package: { include: { provides: true, requires: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(contributions.map(mapContribution));
}

// POST /api/contributions — create a new contribution (propose a package)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const c = await db.contribution.create({
    data: {
      worldProjectId: body.worldProjectId,
      packageId: body.packageId ?? null,
      contributorName: body.contributorName ?? "anonymous",
      title: body.title ?? "Untitled contribution",
      description: body.description ?? "",
      targetSlot: body.targetSlot ?? null,
      status: "PENDING",
    },
    include: { package: { include: { provides: true, requires: true } } },
  });
  return NextResponse.json(mapContribution(c), { status: 201 });
}
