import { NextRequest, NextResponse } from "next/server";
import { listBranches, createBranch } from "@/lib/playliquid/services/world-git";

export const dynamic = "force-dynamic";

// GET /api/world-projects/[id]/branches
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const branches = await listBranches(id);
  return NextResponse.json({ worldProjectId: id, branches });
}

// POST /api/world-projects/[id]/branches { name, parentBranchName }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  try {
    const branch = await createBranch(id, body.name, body.parentBranchName ?? "main", body.parentBranchId);
    return NextResponse.json({ ok: true, branch }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
