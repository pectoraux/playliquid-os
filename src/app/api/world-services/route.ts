import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { mapWorldService } from "@/lib/playliquid/mappers";

export const dynamic = "force-dynamic";

// GET /api/world-services — list all platform OS services
export async function GET() {
  const services = await db.worldService.findMany({
    orderBy: { category: "asc" },
  });
  return NextResponse.json(services.map(mapWorldService));
}

// POST /api/world-services — register a new OS service (admin)
export async function POST(req: NextRequest) {
  const body = await req.json();
  const svc = await db.worldService.create({
    data: {
      name: body.name,
      displayName: body.displayName ?? body.name,
      description: body.description ?? "",
      category: body.category ?? "networking",
      contract: JSON.stringify(body.contract ?? {}),
      provider: body.provider ?? "playliquid",
      status: body.status ?? "ACTIVE",
      config: JSON.stringify(body.config ?? {}),
    },
  });
  return NextResponse.json(mapWorldService(svc), { status: 201 });
}
