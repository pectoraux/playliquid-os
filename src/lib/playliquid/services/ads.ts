// ════════════════════════════════════════════════════════════════
// ADS SERVICE — Ad Surfaces, Frequency Caps, Auctions
// ════════════════════════════════════════════════════════════════
//
// Phase M: Real ad service. Worlds declare ad policy (placements);
// the OS handles the auction (highest bid wins) and frequency caps
// (max impressions per player per hour).
//
// Contracts fulfilled:
//   - ads.surfaces: register/query ad placements
//   - ads.auction: run auction, enforce frequency cap
//
// The existing AdService in engine-adapters.ts had the contract stub;
// this is the real implementation.

export interface AdPlacement {
  id: string;
  surface: string; // "billboard" | "kiosk" | "digital-screen" | "interstitial"
  worldAnchor: string; // semantic anchor where the ad appears
  frequencyCap: number; // max impressions per player per hour
  categoryFilter: string[];
  enabled: boolean;
}

export interface AdBid {
  bidderId: string;
  creativeId: string;
  amount: number; // bid in currency units
  category: string;
  targetAnchor: string;
}

export interface AdAuctionResult {
  winner: AdBid | null;
  reason: string;
  impressionsRemaining: number;
}

// ── In-memory store (a real ad network would back this with a DB) ──
const placements = new Map<string, AdPlacement>();
const impressionLog = new Map<string, number[]>(); // playerKey → [timestamps]

function playerKey(playerId: string, placementId: string): string {
  return `${playerId}:${placementId}`;
}

// ── Register an ad placement ────────────────────────────────────
export function registerPlacement(placement: AdPlacement): void {
  placements.set(placement.id, placement);
}

// ── Get placements for a world anchor ───────────────────────────
export function getPlacementsForAnchor(worldAnchor: string): AdPlacement[] {
  return Array.from(placements.values()).filter(
    (p) => p.worldAnchor === worldAnchor && p.enabled
  );
}

// ── Check frequency cap ─────────────────────────────────────────
// Returns the number of impressions remaining in the current hour.
export function getImpressionsRemaining(playerId: string, placementId: string): number {
  const placement = placements.get(placementId);
  if (!placement) return 0;
  const key = playerKey(playerId, placementId);
  const now = Date.now();
  const hourAgo = now - 3600 * 1000;
  const recent = (impressionLog.get(key) ?? []).filter((t) => t > hourAgo);
  impressionLog.set(key, recent);
  return Math.max(0, placement.frequencyCap - recent.length);
}

// ── Record an impression ────────────────────────────────────────
export function recordImpression(playerId: string, placementId: string): void {
  const key = playerKey(playerId, placementId);
  const log = impressionLog.get(key) ?? [];
  log.push(Date.now());
  impressionLog.set(key, log);
}

// ── Run an auction ──────────────────────────────────────────────
// Highest bid wins, subject to: (1) frequency cap not exceeded,
// (2) bid category matches placement categoryFilter, (3) bid target
// matches the placement's anchor. If no valid bids, no ad shows.
export function runAuction(
  playerId: string,
  placementId: string,
  bids: AdBid[]
): AdAuctionResult {
  const placement = placements.get(placementId);
  if (!placement) return { winner: null, reason: "placement not found", impressionsRemaining: 0 };
  if (!placement.enabled) return { winner: null, reason: "placement disabled", impressionsRemaining: 0 };

  const remaining = getImpressionsRemaining(playerId, placementId);
  if (remaining <= 0) return { winner: null, reason: "frequency cap exceeded", impressionsRemaining: 0 };

  // Filter valid bids: category matches, target anchor matches
  const validBids = bids.filter(
    (b) =>
      (placement.categoryFilter.length === 0 || placement.categoryFilter.includes(b.category)) &&
      b.targetAnchor === placement.worldAnchor
  );

  if (validBids.length === 0) return { winner: null, reason: "no valid bids", impressionsRemaining: remaining };

  // Highest bid wins
  const winner = validBids.reduce((max, b) => (b.amount > max.amount ? b : max), validBids[0]);

  // Record the impression
  recordImpression(playerId, placementId);

  return {
    winner,
    reason: "highest valid bid",
    impressionsRemaining: remaining - 1,
  };
}

// ── List all placements (for admin/debug) ───────────────────────
export function listPlacements(): AdPlacement[] {
  return Array.from(placements.values());
}

// ── Seed default placements (called once) ───────────────────────
export function seedDefaultPlacements(): void {
  if (placements.size > 0) return;
  registerPlacement({
    id: "billboard-canal-belt",
    surface: "billboard",
    worldAnchor: "amsterdam.canal-belt",
    frequencyCap: 5,
    categoryFilter: ["travel", "retail"],
    enabled: true,
  });
  registerPlacement({
    id: "kiosk-city-center",
    surface: "kiosk",
    worldAnchor: "amsterdam.city-center",
    frequencyCap: 3,
    categoryFilter: [],
    enabled: true,
  });
  registerPlacement({
    id: "interstitial-loading",
    surface: "interstitial",
    worldAnchor: "system.loading",
    frequencyCap: 2,
    categoryFilter: ["games", "apps"],
    enabled: true,
  });
}

// Auto-seed on module load
seedDefaultPlacements();
