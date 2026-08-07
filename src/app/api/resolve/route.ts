import { NextRequest, NextResponse } from "next/server";
import { resolvePackages } from "@/lib/playliquid/resolver";
import type { ReusePolicy } from "@/lib/playliquid/types";

export const dynamic = "force-dynamic";

// POST /api/resolve
// body: { specificationId, worldProjectId?, reusePolicy }
// Returns reused / generated / missing packages for a specification.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const specificationId: string = body.specificationId;
  const worldProjectId: string | undefined = body.worldProjectId;
  const reusePolicy: ReusePolicy = body.reusePolicy ?? "auto";

  if (!specificationId) {
    return NextResponse.json({ error: "specificationId is required" }, { status: 400 });
  }

  try {
    const result = await resolvePackages({ specificationId, worldProjectId, reusePolicy });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "resolution failed" },
      { status: 400 }
    );
  }
}
