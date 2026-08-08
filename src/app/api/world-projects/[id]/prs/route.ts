import { NextRequest, NextResponse } from "next/server";
import { createPR, listPRs, reviewPR, mergePR } from "@/lib/playliquid/services/world-git";

export const dynamic = "force-dynamic";

// GET /api/world-projects/[id]/prs?status=OPEN
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const prs = await listPRs(id, status);
  return NextResponse.json({ worldProjectId: id, prs });
}

// POST /api/world-projects/[id]/prs { action: "create"|"review"|"merge", ... }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  try {
    if (body.action === "create") {
      const pr = await createPR(id, body.title, body.description, body.sourceBranchName, body.targetBranchName ?? "main", body.contributorName ?? "anonymous");
      return NextResponse.json({ ok: true, pr }, { status: 201 });
    }
    if (body.action === "review") {
      const pr = await reviewPR(body.prId, body.reviewerName, body.reviewStatus);
      return NextResponse.json({ ok: true, pr });
    }
    if (body.action === "merge") {
      const pr = await mergePR(body.prId, body.reviewerName);
      return NextResponse.json({ ok: true, pr });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 400 });
  }
}
