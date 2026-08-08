// ════════════════════════════════════════════════════════════════
// SENSORY SERVICE — Smell, Haptics, Taste, Proprioception
// ════════════════════════════════════════════════════════════════
//
// Phase Q: The sensory runtime. Sensory emissions are like visual draw
// commands, but for non-visual senses. A package emits "smell of coffee"
// at a position; the sensory adapter translates it to the player's
// olfactory device. Spatial attenuation: closer = stronger (like voice).
//
// This is a Runtime Adapter + World Service extension — NOT a new
// primitive. Packages declare sensory emissions through KernelContext;
// the OS routes them to interested sensory adapters.
//
// Channels:
//   - olfactory (smell): scents with intensity + spatial falloff
//   - haptic (touch): vibrations, pressure, temperature
//   - gustatory (taste): flavor profiles
//   - vestibular (proprioception): motion, balance, acceleration

import { db } from "@/lib/db";

export interface SensoryChannel {
  id: string;
  worldProjectId: string;
  name: string;
  channelType: string; // "olfactory" | "haptic" | "gustatory" | "vestibular"
  maxRange: number;
  metadata: Record<string, unknown>;
}

export interface SensoryEmission {
  id: string;
  channelId: string;
  entityId: string;
  intensity: number; // 0.0 to 1.0
  position: { x: number; y: number; z: number };
  payload: Record<string, unknown>; // { scent: "coffee", duration: 5000 }
  expiresAt: Date | null;
  createdAt: Date;
}

function mapChannel(c: any): SensoryChannel {
  return {
    id: c.id,
    worldProjectId: c.worldProjectId,
    name: c.name,
    channelType: c.channelType,
    maxRange: c.maxRange,
    metadata: (() => { try { return JSON.parse(c.metadata); } catch { return {}; } })(),
  };
}

function mapEmission(e: any): SensoryEmission {
  return {
    id: e.id,
    channelId: e.channelId,
    entityId: e.entityId,
    intensity: e.intensity,
    position: (() => { try { return JSON.parse(e.position); } catch { return { x: 0, y: 0, z: 0 }; } })(),
    payload: (() => { try { return JSON.parse(e.payload); } catch { return {}; } })(),
    expiresAt: e.expiresAt,
    createdAt: e.createdAt,
  };
}

// ── Create a sensory channel ────────────────────────────────────
export async function createChannel(
  worldProjectId: string,
  name: string,
  channelType: string = "olfactory",
  maxRange: number = 50
): Promise<SensoryChannel> {
  const channel = await db.sensoryChannel.create({
    data: { worldProjectId, name, channelType, maxRange, metadata: "{}" },
  });
  return mapChannel(channel);
}

// ── List channels ───────────────────────────────────────────────
export async function listChannels(worldProjectId: string): Promise<SensoryChannel[]> {
  const channels = await db.sensoryChannel.findMany({ where: { worldProjectId } });
  return channels.map(mapChannel);
}

// ── Emit a sensory event ────────────────────────────────────────
// A package calls this through KernelContext.emit("sensory", { channel, ... })
// to emit a smell, haptic pulse, etc. at a position.
export async function emitSensory(
  channelId: string,
  entityId: string,
  intensity: number,
  position: { x: number; y: number; z: number },
  payload: Record<string, unknown> = {},
  durationMs: number | null = null
): Promise<SensoryEmission> {
  const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;
  const emission = await db.sensoryEmission.create({
    data: {
      channelId,
      entityId,
      intensity: Math.max(0, Math.min(1, intensity)),
      position: JSON.stringify(position),
      payload: JSON.stringify(payload),
      expiresAt,
    },
  });
  return mapEmission(emission);
}

// ── Get active emissions for a player position ──────────────────
// Returns all non-expired emissions within range, with attenuated
// intensity based on distance. This is what a sensory adapter calls
// to know what the player should smell/feel/taste right now.
export async function getActiveEmissions(
  channelId: string,
  playerPosition: { x: number; y: number; z: number }
): Promise<Array<SensoryEmission & { attenuatedIntensity: number }>> {
  const channel = await db.sensoryChannel.findUnique({ where: { id: channelId } });
  if (!channel) return [];

  const now = new Date();
  const emissions = await db.sensoryEmission.findMany({
    where: {
      channelId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return emissions
    .map((e) => {
      const em = mapEmission(e);
      const dx = playerPosition.x - em.position.x;
      const dy = playerPosition.y - em.position.y;
      const dz = playerPosition.z - em.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist >= channel.maxRange) return null; // out of range
      // Linear attenuation: 1.0 at distance 0, 0.0 at maxRange
      const attenuation = Math.max(0, 1.0 - dist / channel.maxRange);
      return {
        ...em,
        attenuatedIntensity: em.intensity * attenuation,
        distance: dist,
      } as any;
    })
    .filter((e): e is any => e !== null)
    .sort((a, b) => b.attenuatedIntensity - a.attenuatedIntensity);
}

// ── Spatial attenuation (same model as voice) ───────────────────
export function computeSensoryAttenuation(
  listenerPos: { x: number; y: number; z: number },
  sourcePos: { x: number; y: number; z: number },
  maxRange: number
): number {
  const dx = listenerPos.x - sourcePos.x;
  const dy = listenerPos.y - sourcePos.y;
  const dz = listenerPos.z - sourcePos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist >= maxRange) return 0;
  return Math.max(0, 1.0 - dist / maxRange);
}

// ── Clear expired emissions (cleanup) ───────────────────────────
export async function clearExpired(channelId?: string): Promise<number> {
  const now = new Date();
  const where: Record<string, unknown> = { expiresAt: { lt: now } };
  if (channelId) where.channelId = channelId;
  const result = await db.sensoryEmission.deleteMany({ where });
  return result.count;
}
