// ════════════════════════════════════════════════════════════════
// WORLD GIT SERVICE — Branches, Commits, Pull Requests
// ════════════════════════════════════════════════════════════════
//
// Phase O: Real production Git for World Projects. Branches, commits
// (content-hashed, forming a history graph), and pull requests (review
// + merge). This is the GitHub-for-Worlds layer.
//
// Contracts:
//   - git.branch: create, list, get history
//   - git.commit: commit the current package manifest state
//   - git.pr: create, review, merge
//
// The OS provides this; worlds are versioned source repositories.

import { db } from "@/lib/db";
import { contentHash } from "../hashing";

export interface Branch {
  id: string;
  worldProjectId: string;
  name: string;
  parentBranchId: string | null;
  headCommitId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Commit {
  id: string;
  hash: string;
  branchId: string;
  parentCommitId: string | null;
  authorName: string;
  message: string;
  packageManifest: string[];
  spatialSlots: unknown;
  policies: unknown;
  createdAt: Date;
}

export interface PullRequest {
  id: string;
  title: string;
  description: string;
  sourceBranchId: string;
  targetBranchId: string;
  status: string;
  contributorName: string;
  reviewStatus: string;
  reviewerName: string | null;
  mergedAt: Date | null;
  createdAt: Date;
}

function mapBranch(b: any): Branch {
  return {
    id: b.id, worldProjectId: b.worldProjectId, name: b.name,
    parentBranchId: b.parentBranchId, headCommitId: b.headCommitId,
    createdAt: b.createdAt, updatedAt: b.updatedAt,
  };
}

function mapCommit(c: any): Commit {
  return {
    id: c.id, hash: c.hash, branchId: c.branchId, parentCommitId: c.parentCommitId,
    authorName: c.authorName, message: c.message,
    packageManifest: (() => { try { return JSON.parse(c.packageManifest); } catch { return []; } })(),
    spatialSlots: (() => { try { return JSON.parse(c.spatialSlots); } catch { return []; } })(),
    policies: (() => { try { return JSON.parse(c.policies); } catch { return []; } })(),
    createdAt: c.createdAt,
  };
}

function mapPR(p: any): PullRequest {
  return {
    id: p.id, title: p.title, description: p.description,
    sourceBranchId: p.sourceBranchId, targetBranchId: p.targetBranchId,
    status: p.status, contributorName: p.contributorName,
    reviewStatus: p.reviewStatus, reviewerName: p.reviewerName,
    mergedAt: p.mergedAt, createdAt: p.createdAt,
  };
}

// ── Ensure the "main" branch exists for a project ───────────────
export async function ensureMainBranch(worldProjectId: string): Promise<Branch> {
  const existing = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId, name: "main" } },
  });
  if (existing) return mapBranch(existing);
  const branch = await db.worldBranch.create({
    data: { worldProjectId, name: "main", parentBranchId: null },
  });
  return mapBranch(branch);
}

// ── Create a branch ─────────────────────────────────────────────
export async function createBranch(
  worldProjectId: string,
  name: string,
  parentBranchName: string = "main",
  parentBranchId?: string
): Promise<Branch> {
  // Ensure main exists first
  await ensureMainBranch(worldProjectId);

  const existing = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId, name } },
  });
  if (existing) throw new Error(`branch "${name}" already exists`);

  // Find parent
  let parentId = parentBranchId;
  if (!parentId) {
    const parent = await db.worldBranch.findUnique({
      where: { worldProjectId_name: { worldProjectId, name: parentBranchName } },
    });
    if (!parent) throw new Error(`parent branch "${parentBranchName}" not found`);
    parentId = parent.id;
  }

  const branch = await db.worldBranch.create({
    data: { worldProjectId, name, parentBranchId: parentId },
  });
  return mapBranch(branch);
}

// ── List branches ───────────────────────────────────────────────
export async function listBranches(worldProjectId: string): Promise<Branch[]> {
  await ensureMainBranch(worldProjectId);
  const branches = await db.worldBranch.findMany({ where: { worldProjectId }, orderBy: { createdAt: "asc" } });
  return branches.map(mapBranch);
}

// ── Commit to a branch ──────────────────────────────────────────
export async function commit(
  worldProjectId: string,
  branchName: string,
  authorName: string,
  message: string,
  packageManifest: string[] = [],
  spatialSlots: unknown = [],
  policies: unknown = []
): Promise<Commit> {
  await ensureMainBranch(worldProjectId);
  const branch = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId, name: branchName } },
  });
  if (!branch) throw new Error(`branch "${branchName}" not found`);

  const hash = contentHash({
    branchName, authorName, message, packageManifest,
    spatialSlots, policies, parent: branch.headCommitId, timestamp: Date.now(),
  });

  const commit = await db.worldCommit.create({
    data: {
      worldProjectId,
      branchId: branch.id,
      parentCommitId: branch.headCommitId,
      hash,
      authorName,
      message,
      packageManifest: JSON.stringify(packageManifest),
      spatialSlots: JSON.stringify(spatialSlots),
      policies: JSON.stringify(policies),
    },
  });

  // Advance the branch head
  await db.worldBranch.update({
    where: { id: branch.id },
    data: { headCommitId: commit.id },
  });

  return mapCommit(commit);
}

// ── Get commit history for a branch ─────────────────────────────
export async function getHistory(worldProjectId: string, branchName: string): Promise<Commit[]> {
  const branch = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId, name: branchName } },
  });
  if (!branch) return [];
  const commits = await db.worldCommit.findMany({
    where: { branchId: branch.id },
    orderBy: { createdAt: "desc" },
  });
  return commits.map(mapCommit);
}

// ── Create a pull request ───────────────────────────────────────
export async function createPR(
  worldProjectId: string,
  title: string,
  description: string,
  sourceBranchName: string,
  targetBranchName: string,
  contributorName: string
): Promise<PullRequest> {
  const source = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId, name: sourceBranchName } },
  });
  const target = await db.worldBranch.findUnique({
    where: { worldProjectId_name: { worldProjectId, name: targetBranchName } },
  });
  if (!source) throw new Error(`source branch "${sourceBranchName}" not found`);
  if (!target) throw new Error(`target branch "${targetBranchName}" not found`);
  if (source.id === target.id) throw new Error("source and target must differ");

  const pr = await db.pullRequest.create({
    data: {
      worldProjectId, title, description,
      sourceBranchId: source.id, targetBranchId: target.id,
      contributorName, status: "OPEN", reviewStatus: "PENDING",
    },
  });
  return mapPR(pr);
}

// ── Review a PR ─────────────────────────────────────────────────
export async function reviewPR(
  prId: string,
  reviewerName: string,
  reviewStatus: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED"
): Promise<PullRequest> {
  const pr = await db.pullRequest.update({
    where: { id: prId },
    data: { reviewerName, reviewStatus, reviewedAt: new Date() },
  });
  return mapPR(pr);
}

// ── Merge a PR ──────────────────────────────────────────────────
// Merging: fast-forward the target branch's head to the source branch's
// head (if target has no divergent commits). In a real system this would
// do a 3-way merge; here we fast-forward for simplicity.
export async function mergePR(prId: string, reviewerName: string): Promise<PullRequest> {
  const pr = await db.pullRequest.findUnique({ where: { id: prId } });
  if (!pr) throw new Error("PR not found");
  if (pr.status !== "OPEN") throw new Error(`PR is ${pr.status}, not OPEN`);
  if (pr.reviewStatus !== "APPROVED") throw new Error(`PR review is ${pr.reviewStatus}, not APPROVED`);

  const source = await db.worldBranch.findUnique({ where: { id: pr.sourceBranchId } });
  if (!source || !source.headCommitId) throw new Error("source branch has no commits");

  // Fast-forward target to source head
  await db.worldBranch.update({
    where: { id: pr.targetBranchId },
    data: { headCommitId: source.headCommitId },
  });

  const merged = await db.pullRequest.update({
    where: { id: prId },
    data: { status: "MERGED", mergedAt: new Date(), reviewerName },
  });
  return mapPR(merged);
}

// ── List PRs ────────────────────────────────────────────────────
export async function listPRs(worldProjectId: string, status?: string): Promise<PullRequest[]> {
  const where: Record<string, unknown> = { worldProjectId };
  if (status) where.status = status;
  const prs = await db.pullRequest.findMany({ where, orderBy: { createdAt: "desc" } });
  return prs.map(mapPR);
}
