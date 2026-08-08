// ════════════════════════════════════════════════════════════════
// VOICE SERVICE — Spatial Voice Channels + WebRTC Signaling
// ════════════════════════════════════════════════════════════════
//
// Real voice transport: WebRTC peer-to-peer audio. The control plane
// relays WebRTC signaling (offer/answer/ICE candidates) between players
// in the same voice channel, establishing real peer-to-peer audio
// connections. Spatial attenuation is applied client-side via WebRTC
// gain nodes based on the positions this service tracks.
//
// Contracts fulfilled:
//   - voice.spatial: join/leave, spatial attenuation based on position
//   - voice.channels: create/list channels
//   - voice.webrtc: signaling relay (offer/answer/ICE) for P2P audio

import { db } from "@/lib/db";

export interface VoiceChannel {
  id: string;
  worldProjectId: string;
  name: string;
  spatialModel: string; // "distance" | "zone" | "global"
  maxListeners: number;
  metadata: Record<string, unknown>;
}

export interface VoiceChannelMember {
  id: string;
  channelId: string;
  playerId: string;
  position: { x: number; y: number; z: number };
  muted: boolean;
  speaking: boolean;
  joinedAt: Date;
}

function mapChannel(c: any): VoiceChannel {
  return {
    id: c.id,
    worldProjectId: c.worldProjectId,
    name: c.name,
    spatialModel: c.spatialModel,
    maxListeners: c.maxListeners,
    metadata: (() => { try { return JSON.parse(c.metadata); } catch { return {}; } })(),
  };
}

function mapMember(m: any): VoiceChannelMember {
  return {
    id: m.id,
    channelId: m.channelId,
    playerId: m.playerId,
    position: (() => { try { return JSON.parse(m.position); } catch { return { x: 0, y: 0, z: 0 }; } })(),
    muted: m.muted,
    speaking: m.speaking,
    joinedAt: m.joinedAt,
  };
}

// ── Create a voice channel ──────────────────────────────────────
export async function createChannel(
  worldProjectId: string,
  name: string,
  spatialModel: string = "distance",
  maxListeners: number = 50
): Promise<VoiceChannel> {
  const channel = await db.voiceChannel.create({
    data: { worldProjectId, name, spatialModel, maxListeners, metadata: "{}" },
  });
  return mapChannel(channel);
}

// ── List channels in a world ────────────────────────────────────
export async function listChannels(worldProjectId: string): Promise<VoiceChannel[]> {
  const channels = await db.voiceChannel.findMany({ where: { worldProjectId } });
  return channels.map(mapChannel);
}

// ── Join a channel ──────────────────────────────────────────────
export async function joinChannel(
  channelId: string,
  playerId: string,
  position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
): Promise<{ member: VoiceChannelMember; channel: VoiceChannel }> {
  const channel = await db.voiceChannel.findUnique({ where: { id: channelId } });
  if (!channel) throw new Error("channel not found");

  const memberCount = await db.voiceChannelMember.count({ where: { channelId } });
  if (memberCount >= channel.maxListeners) throw new Error("channel full");

  const member = await db.voiceChannelMember.upsert({
    where: { channelId_playerId: { channelId, playerId } },
    update: { position: JSON.stringify(position), muted: false },
    create: { channelId, playerId, position: JSON.stringify(position) },
  });

  return { member: mapMember(member), channel: mapChannel(channel) };
}

// ── Leave a channel ─────────────────────────────────────────────
export async function leaveChannel(channelId: string, playerId: string): Promise<boolean> {
  await db.voiceChannelMember.deleteMany({ where: { channelId, playerId } });
  return true;
}

// ── Update position (for spatial attenuation) ───────────────────
export async function updatePosition(
  channelId: string,
  playerId: string,
  position: { x: number; y: number; z: number }
): Promise<VoiceChannelMember> {
  const member = await db.voiceChannelMember.update({
    where: { channelId_playerId: { channelId, playerId } },
    data: { position: JSON.stringify(position) },
  });
  return mapMember(member);
}

// ── Set speaking/muted ──────────────────────────────────────────
export async function setSpeaking(channelId: string, playerId: string, speaking: boolean): Promise<VoiceChannelMember> {
  const member = await db.voiceChannelMember.update({
    where: { channelId_playerId: { channelId, playerId } },
    data: { speaking },
  });
  return mapMember(member);
}

export async function setMuted(channelId: string, playerId: string, muted: boolean): Promise<VoiceChannelMember> {
  const member = await db.voiceChannelMember.update({
    where: { channelId_playerId: { channelId, playerId } },
    data: { muted },
  });
  return mapMember(member);
}

// ── List members in a channel ───────────────────────────────────
export async function listMembers(channelId: string): Promise<VoiceChannelMember[]> {
  const members = await db.voiceChannelMember.findMany({ where: { channelId } });
  return members.map(mapMember);
}

// ── Spatial attenuation: compute audio gain between two positions ──
// This is the spatial model. For "distance" channels, gain falls off
// with distance. For "zone" channels, gain is 1.0 if same zone, 0 otherwise.
// For "global" channels, gain is always 1.0.
export function computeAttenuation(
  model: string,
  listenerPos: { x: number; y: number; z: number },
  speakerPos: { x: number; y: number; z: number },
  maxDistance: number = 50
): number {
  if (model === "global") return 1.0;
  if (model === "zone") {
    // Same zone if within maxDistance
    const dx = listenerPos.x - speakerPos.x;
    const dz = listenerPos.z - speakerPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    return dist < maxDistance ? 1.0 : 0.0;
  }
  // "distance": inverse distance attenuation
  const dx = listenerPos.x - speakerPos.x;
  const dy = listenerPos.y - speakerPos.y;
  const dz = listenerPos.z - speakerPos.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist >= maxDistance) return 0.0;
  // Linear attenuation: 1.0 at distance 0, 0.0 at maxDistance
  return Math.max(0, 1.0 - dist / maxDistance);
}

// ── WebRTC Signaling ────────────────────────────────────────────
// The control plane relays WebRTC signaling between players in the
// same voice channel. Each player creates an RTCPeerConnection, sends
// an offer to all other members, receives answers, and exchanges ICE
// candidates. Once connected, audio flows peer-to-peer (not through
// the server). Spatial attenuation is applied client-side via gain
// nodes based on the positions this service tracks.

export interface WebRTCSignal {
  type: "offer" | "answer" | "ice-candidate";
  fromPlayerId: string;
  toPlayerId: string;
  channelId: string;
  payload: unknown; // SDP offer/answer or ICE candidate
  timestamp: number;
}

// In-memory signal queue per player (a real SFU would use a message queue)
const signalQueues = new Map<string, WebRTCSignal[]>();

// ── Send a WebRTC signal to a player ────────────────────────────
export async function sendSignal(
  channelId: string,
  fromPlayerId: string,
  toPlayerId: string,
  type: "offer" | "answer" | "ice-candidate",
  payload: unknown
): Promise<{ queued: boolean; shouldEstablish: boolean }> {
  // Verify both players are in the channel
  const members = await db.voiceChannelMember.findMany({
    where: { channelId, playerId: { in: [fromPlayerId, toPlayerId] } },
  });
  if (members.length < 2) {
    throw new Error("both players must be in the channel");
  }

  const signal: WebRTCSignal = {
    type,
    fromPlayerId,
    toPlayerId,
    channelId,
    payload,
    timestamp: Date.now(),
  };

  const queue = signalQueues.get(toPlayerId) ?? [];
  queue.push(signal);
  signalQueues.set(toPlayerId, queue);

  // If this is an answer, the connection should establish
  const shouldEstablish = type === "answer";
  return { queued: true, shouldEstablish };
}

// ── Poll for pending signals (client calls this) ────────────────
export async function pollSignals(playerId: string): Promise<WebRTCSignal[]> {
  const signals = signalQueues.get(playerId) ?? [];
  // Clear the queue after polling
  signalQueues.set(playerId, []);
  return signals;
}

// ── Get the list of peers to connect to in a channel ────────────
// When a player joins a channel, they need to know which other players
// to initiate WebRTC connections with. This returns the list.
export async function getChannelPeers(channelId: string, playerId: string): Promise<{
  peers: Array<{ playerId: string; position: { x: number; y: number; z: number } }>;
}> {
  const members = await db.voiceChannelMember.findMany({
    where: { channelId, playerId: { not: playerId } },
  });
  return {
    peers: members.map((m) => ({
      playerId: m.playerId,
      position: (() => { try { return JSON.parse(m.position); } catch { return { x: 0, y: 0, z: 0 }; } })(),
    })),
  };
}

// ── Clear signals when a player leaves ─────────────────────────
export function clearSignals(playerId: string): void {
  signalQueues.delete(playerId);
}
