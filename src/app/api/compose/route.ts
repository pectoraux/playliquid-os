import { NextRequest, NextResponse } from "next/server";
import { composeWorld } from "@/lib/playliquid/composer";

export const dynamic = "force-dynamic";

// POST /api/compose
// body: { worldProjectId, packageIds[] }
// Runs the Composition Engine: resolves dependencies, wires interfaces,
// builds the spatial graph, freezes an immutable World Build.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const worldProjectId: string = body.worldProjectId;
  const packageIds: string[] = body.packageIds;

  if (!worldProjectId || !Array.isArray(packageIds) || packageIds.length === 0) {
    return NextResponse.json(
      { error: "worldProjectId and a non-empty packageIds[] are required" },
      { status: 400 }
    );
  }

  try {
    const result = await composeWorld({ worldProjectId, packageIds });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "composition failed" },
      { status: 400 }
    );
  }
}
