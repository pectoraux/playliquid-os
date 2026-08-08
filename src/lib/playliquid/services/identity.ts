// ════════════════════════════════════════════════════════════════
// IDENTITY SERVICE — World-Player Identity
// ════════════════════════════════════════════════════════════════
//
// Phase M: Real world-player identity. Distinct from console User.
// A User is the console account; a PlayerIdentity is the in-world
// player. One User → many PlayerIdentities (one per world).
//
// Contracts fulfilled:
//   - identity.sessions: create/get player identity for a world
//   - identity.tokens: capability tokens (scoped, time-limited)

import { db } from "@/lib/db";
import { contentHash } from "../hashing";

export interface PlayerIdentity {
  id: string;
  userId: string | null;
  worldProjectId: string;
  displayName: string;
  avatarUrl: string | null;
  metadata: Record<string, unknown>;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CapabilityToken {
  token: string;
  playerId: string;
  capabilities: string[];
  worldProjectId: string;
  expiresAt: number;
}

function mapIdentity(p: any): PlayerIdentity {
  return {
    id: p.id,
    userId: p.userId,
    worldProjectId: p.worldProjectId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    metadata: (() => { try { return JSON.parse(p.metadata); } catch { return {}; } })(),
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ── Create or get a player identity ─────────────────────────────
export async function getOrCreateIdentity(
  userId: string | null,
  worldProjectId: string,
  displayName: string
): Promise<PlayerIdentity> {
  // If userId is provided, try to find an existing identity for this user+world
  if (userId) {
    const existing = await db.playerIdentity.findFirst({
      where: { userId, worldProjectId, status: "ACTIVE" },
    });
    if (existing) return mapIdentity(existing);
  }
  const identity = await db.playerIdentity.create({
    data: { userId, worldProjectId, displayName, metadata: "{}", status: "ACTIVE" },
  });
  return mapIdentity(identity);
}

// ── Get identity by ID ──────────────────────────────────────────
export async function getIdentity(playerId: string): Promise<PlayerIdentity | null> {
  const p = await db.playerIdentity.findUnique({ where: { id: playerId } });
  return p ? mapIdentity(p) : null;
}

// ── List identities in a world ──────────────────────────────────
export async function listIdentities(worldProjectId: string): Promise<PlayerIdentity[]> {
  const identities = await db.playerIdentity.findMany({
    where: { worldProjectId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return identities.map(mapIdentity);
}

// ── Issue a capability token (scoped, time-limited) ─────────────
// A capability token lets a package act on behalf of a player for a
// specific set of capabilities. Tokens are content-hashed (verifiable)
// and expire. This is the identity.tokens contract.
const tokenStore = new Map<string, CapabilityToken>();

export async function issueCapabilityToken(
  playerId: string,
  worldProjectId: string,
  capabilities: string[],
  ttlSeconds: number = 3600
): Promise<CapabilityToken> {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const token = contentHash({ playerId, worldProjectId, capabilities, expiresAt, salt: Math.random() });
  const cap: CapabilityToken = { token, playerId, capabilities, worldProjectId, expiresAt };
  tokenStore.set(token, cap);
  return cap;
}

// ── Verify a capability token ───────────────────────────────────
export async function verifyCapabilityToken(
  token: string,
  requiredCapability?: string
): Promise<{ valid: boolean; playerId?: string; reason?: string }> {
  const cap = tokenStore.get(token);
  if (!cap) return { valid: false, reason: "token not found" };
  if (Date.now() > cap.expiresAt) {
    tokenStore.delete(token);
    return { valid: false, reason: "token expired" };
  }
  if (requiredCapability && !cap.capabilities.includes(requiredCapability)) {
    return { valid: false, reason: `token lacks capability: ${requiredCapability}` };
  }
  return { valid: true, playerId: cap.playerId };
}

// ── Revoke a token ──────────────────────────────────────────────
export async function revokeCapabilityToken(token: string): Promise<boolean> {
  return tokenStore.delete(token);
}
