// PRIMITIVE K — Kernel (simulator adapter)
// Small, frozen runtime: scheduler, event bus, entity lifecycle,
// capability system, state. Networking/persistence/rendering are
// *abstractions* to be implemented by future adapters — never baked in.

import { db } from "@/lib/db";
import { mapKernelEvent } from "./mappers";

// ── Event Bus ─────────────────────────────────────────────────────
export async function emitEvent(type: string, payload: Record<string, unknown>, entityId?: string) {
  const event = await db.kernelEvent.create({
    data: { type, payload: JSON.stringify(payload), entityId },
  });
  return mapKernelEvent(event);
}

export async function recentEvents(limit = 50) {
  const events = await db.kernelEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { entity: true },
  });
  return events.map(mapKernelEvent);
}

// ── Scheduler ─────────────────────────────────────────────────────
// One tick advances every running node's simulation: mutates a piece of
// entity state and emits a capability.invoke event. This is the place
// where future physics / AI / network ticks would hook in.
export async function tick() {
  const runningNodes = await db.worldNode.findMany({
    where: { status: "running" },
    include: {
      worldBuild: { include: { entities: true } },
    },
  });

  const emitted = [];
  for (const node of runningNodes) {
    for (const entity of node.worldBuild.entities) {
      // mutate position slightly (a toy "physics" tick)
      const pos = JSON.parse(entity.position) as { x: number; y: number; z: number };
      const dx = (Math.random() - 0.5) * 0.6;
      const dz = (Math.random() - 0.5) * 0.6;
      const next = { x: +(pos.x + dx).toFixed(2), y: pos.y, z: +(pos.z + dz).toFixed(2) };
      await db.entity.update({
        where: { id: entity.id },
        data: { position: JSON.stringify(next) },
      });
      const ev = await emitEvent(
        "scheduler.tick",
        {
          nodeId: node.id,
          entityId: entity.id,
          from: pos,
          to: next,
          host: node.host,
        },
        entity.id
      );
      emitted.push(ev);
    }
    // heartbeat
    await emitEvent("node.heartbeat", {
      nodeId: node.id,
      host: node.host,
      at: new Date().toISOString(),
    });
  }

  if (runningNodes.length === 0) {
    emitted.push(
      await emitEvent("scheduler.idle", { reason: "no running nodes" })
    );
  }

  return emitted;
}

// ── Entity Lifecycle ──────────────────────────────────────────────
export async function spawnEntity(input: {
  worldBuildId: string;
  packageId: string;
  name: string;
  position: { x: number; y: number; z: number };
  components: string[];
}) {
  const entity = await db.entity.create({
    data: {
      worldBuildId: input.worldBuildId,
      packageId: input.packageId,
      name: input.name,
      position: JSON.stringify(input.position),
      components: JSON.stringify(input.components),
      state: JSON.stringify({ health: 100, visible: true }),
    },
  });
  await emitEvent("entity.spawn", { entityId: entity.id, name: input.name }, entity.id);
  return entity;
}

// ── Capability System ─────────────────────────────────────────────
export async function invokeCapability(entityId: string, capability: string) {
  const ev = await emitEvent(
    "capability.invoke",
    { entityId, capability, granted: true },
    entityId
  );
  return ev;
}

// ── World Node lifecycle (Runtime Adapter boundary) ───────────────
// "starting" → "running": spawns a seed entity per package and emits events.
export async function startNode(nodeId: string) {
  const node = await db.worldNode.findUnique({
    where: { id: nodeId },
    include: { worldBuild: { include: { packages: { include: { package: true } } } } },
  });
  if (!node) throw new Error("Node not found");

  await db.worldNode.update({
    where: { id: nodeId },
    data: { status: "starting", startedAt: new Date() },
  });
  await emitEvent("node.starting", { nodeId, host: node.host });

  // spawn one entity per package — the "Runtime Adapter" doing its job
  for (const bp of node.worldBuild.packages) {
    await spawnEntity({
      worldBuildId: node.worldBuildId,
      packageId: bp.packageId,
      name: bp.package.displayName,
      position: { x: Math.random() * 24, y: 0, z: Math.random() * 24 },
      components: ["transform", "renderable"],
    });
  }

  await db.worldNode.update({
    where: { id: nodeId },
    data: {
      status: "running",
      health: JSON.stringify({ uptime: 0, entities: node.worldBuild.packages.length, fps: 60 }),
      capabilities: JSON.stringify({ spatial: true, persistence: "memory", networking: "local" }),
    },
  });
  await emitEvent("node.running", { nodeId, host: node.host, entities: node.worldBuild.packages.length });

  return db.worldNode.findUnique({ where: { id: nodeId } });
}

export async function stopNode(nodeId: string) {
  await db.worldNode.update({
    where: { id: nodeId },
    data: { status: "stopped" },
  });
  await emitEvent("node.stopped", { nodeId });
  return db.worldNode.findUnique({ where: { id: nodeId } });
}
