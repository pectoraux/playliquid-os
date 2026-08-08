import { NextRequest, NextResponse } from "next/server";
import { commit, getHistory } from "@/lib/playliquid/services/world-git";

export const dynamic = "force-dynamic";

// GET /api/world-projects/[id]/commits?branch=main
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? "main";
  const commits = await getHistory(id, branch);
  return NextResponse.json({ worldProjectId: id, branch, commits });
}

// POST /api/world-projects/[id]/commits { branchName, authorName, message, packageManifest, spatialSlots, policies }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  try {
    const c = await commit(
      id,
      body.branchName ?? "main",
      body.authorName ?? "anonymous",
      body.message ?? "",
      body.packageManifest ?? [],
      body.spatialSlots ?? [],
      body.policies ?? []
    );
    return NextResponse.json({ ok: true, commit: c }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
