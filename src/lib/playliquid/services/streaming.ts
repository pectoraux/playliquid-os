// ════════════════════════════════════════════════════════════════
// STREAMING SERVICE — Dynamic Cell Load/Unload + LOD
// ════════════════════════════════════════════════════════════════
//
// Fixes the 🟡 on spatial streaming: adds dynamic cell load/unload
// (cells load when a player approaches, unload when all players leave)
// and distance-based LOD (Level of Detail — entities render at reduced
// detail at distance).
//
// LOD levels:
//   0 = full detail (close, < 50 units)    — all geometry, all textures
//   1 = reduced detail (medium, 50-100)     — simplified geometry
//   2 = minimal detail (far, 100-200)       — billboard / low-poly
//   3 = culled (very far, > 200)            — not rendered
//
// Cell states:
//   loaded    — at least one player has it in interest range
//   loading   — transitioning (fetching entities)
//   unloaded  — no players nearby; entities not held in memory

export const CELL_SIZE = 50;
export const LOD_THRESHOLDS = { full: 50, reduced: 100, minimal: 200 };

export type LODLevel = 0 | 1 | 2 | 3;
export type CellState = "loaded" | "loading" | "unloaded";

export interface CellInfo {
  key: string;
  cx: number;
  cz: number;
  state: CellState;
  entityCount: number;
  observerCount: number; // how many players have this cell in range
  lastAccessedAt: number;
}

export interface EntityLOD {
  entityId: string;
  lod: LODLevel;
  distance: number;
  cellKey: string;
}

// ── In-memory cell registry (per build) ──────────────────────────
const cellRegistry = new Map<string, Map<string, CellInfo>>();
const playerCells = new Map<string, Set<string>>(); // buildId:sessionId → cells

function getBuildCells(buildId: string): Map<string, CellInfo> {
  let m = cellRegistry.get(buildId);
  if (!m) {
    m = new Map();
    cellRegistry.set(buildId, m);
  }
  return m;
}

function getCellKey(x: number, z: number): string {
  const cx = Math.floor(x / CELL_SIZE);
  const cz = Math.floor(z / CELL_SIZE);
  return `${cx},${cz}`;
}

// ── Compute LOD for an entity given player position ──────────────
export function computeLOD(
  entityPos: { x: number; y: number; z: number },
  playerPos: { x: number; y: number; z: number }
): { lod: LODLevel; distance: number } {
  const dx = entityPos.x - playerPos.x;
  const dy = entityPos.y - playerPos.y;
  const dz = entityPos.z - playerPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (distance < LOD_THRESHOLDS.full) return { lod: 0, distance };
  if (distance < LOD_THRESHOLDS.reduced) return { lod: 1, distance };
  if (distance < LOD_THRESHOLDS.minimal) return { lod: 2, distance };
  return { lod: 3, distance };
}

// ── Get LOD label ───────────────────────────────────────────────
export function lodLabel(lod: LODLevel): string {
  return ["full", "reduced", "minimal", "culled"][lod];
}

// ── Update player position → load/unload cells dynamically ──────
// When a player moves, cells entering their interest radius are loaded;
// cells that no longer have any observers are unloaded.
export function updatePlayerCells(
  buildId: string,
  sessionId: string,
  x: number,
  z: number,
  interestRadius: number = 100
): { loaded: string[]; unloaded: string[]; active: string[] } {
  const cells = getBuildCells(buildId);
  const playerKey = `${buildId}:${sessionId}`;

  // Compute the player's new interest cells
  const newCellSet = new Set<string>();
  const playerCellX = Math.floor(x / CELL_SIZE);
  const playerCellZ = Math.floor(z / CELL_SIZE);
  const cellRadius = Math.ceil(interestRadius / CELL_SIZE);

  for (let dx = -cellRadius; dx <= cellRadius; dx++) {
    for (let dz = -cellRadius; dz <= cellRadius; dz++) {
      const cx = playerCellX + dx;
      const cz = playerCellZ + dz;
      // Check if this cell is within the interest radius (not just the cell grid)
      const cellCenterX = cx * CELL_SIZE + CELL_SIZE / 2;
      const cellCenterZ = cz * CELL_SIZE + CELL_SIZE / 2;
      const dist = Math.sqrt(
        (cellCenterX - x) * (cellCenterX - x) +
        (cellCenterZ - z) * (cellCenterZ - z)
      );
      if (dist <= interestRadius) {
        newCellSet.add(`${cx},${cz}`);
      }
    }
  }

  // Get the player's previous cells
  const prevCells = playerCells.get(playerKey) ?? new Set<string>();

  // Find newly loaded cells (in new, not in prev)
  const loaded: string[] = [];
  for (const key of newCellSet) {
    if (!prevCells.has(key)) {
      loaded.push(key);
    }
    // Ensure the cell is registered as loaded
    const [cx, cz] = key.split(",").map(Number);
    const existing = cells.get(key);
    if (existing) {
      existing.observerCount++;
      existing.lastAccessedAt = Date.now();
      existing.state = "loaded";
    } else {
      cells.set(key, {
        key, cx, cz, state: "loaded",
        entityCount: 0, observerCount: 1,
        lastAccessedAt: Date.now(),
      });
    }
  }

  // Find cells to potentially unload (in prev, not in new)
  const unloaded: string[] = [];
  for (const key of prevCells) {
    if (!newCellSet.has(key)) {
      const cell = cells.get(key);
      if (cell) {
        cell.observerCount = Math.max(0, cell.observerCount - 1);
        if (cell.observerCount === 0) {
          cell.state = "unloaded";
          unloaded.push(key);
          // Keep the cell info but mark unloaded (entities released)
        }
      }
    }
  }

  // Update the player's cells
  playerCells.set(playerKey, newCellSet);

  // Active cells = all loaded cells
  const active = Array.from(cells.values())
    .filter((c) => c.state === "loaded")
    .map((c) => c.key);

  return { loaded, unloaded, active };
}

// ── Get all active (loaded) cells ───────────────────────────────
export function getLoadedCells(buildId: string): CellInfo[] {
  const cells = getBuildCells(buildId);
  return Array.from(cells.values()).filter((c) => c.state === "loaded");
}

// ── Get cell info ───────────────────────────────────────────────
export function getCellInfo(buildId: string, cellKey: string): CellInfo | null {
  return getBuildCells(buildId).get(cellKey) ?? null;
}

// ── Remove a player (on disconnect) ─────────────────────────────
export function removePlayer(buildId: string, sessionId: string): string[] {
  const playerKey = `${buildId}:${sessionId}`;
  const prevCells = playerCells.get(playerKey);
  if (!prevCells) return [];

  const cells = getBuildCells(buildId);
  const unloaded: string[] = [];
  for (const key of prevCells) {
    const cell = cells.get(key);
    if (cell) {
      cell.observerCount = Math.max(0, cell.observerCount - 1);
      if (cell.observerCount === 0) {
        cell.state = "unloaded";
        unloaded.push(key);
      }
    }
  }
  playerCells.delete(playerKey);
  return unloaded;
}

// ── Compute LOD for all entities relative to a player ───────────
export function computeEntityLODs(
  entities: Array<{ entityId: string; position: { x: number; y: number; z: number } }>,
  playerPos: { x: number; y: number; z: number }
): EntityLOD[] {
  return entities
    .map((e) => {
      const { lod, distance } = computeLOD(e.position, playerPos);
      return {
        entityId: e.entityId,
        lod,
        distance,
        cellKey: getCellKey(e.position.x, e.position.z),
      };
    })
    .filter((e) => e.lod < 3); // cull LOD 3 (very far)
}
