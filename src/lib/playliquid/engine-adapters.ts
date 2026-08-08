// ════════════════════════════════════════════════════════════════
// PLAYLIQUID UNITY ADAPTER — Engine Adapter Specification + SDK
// ════════════════════════════════════════════════════════════════
//
// R6: The Unity adapter consumes the PlayLiquid Protocol (Scene API +
// SSE stream) and renders the same World Build in Unity.
//
// Unity provides: rendering, physics, animation, audio, input
// PlayLiquid provides: identity, multiplayer, persistence, capabilities,
//   state authority, spatial identity, services
//
// This file is the adapter SPECIFICATION + a TypeScript reference
// implementation that proves the same declarative artifact executes
// across two different adapters (Web Three.js + Unity simulation).
//
// The actual Unity C# SDK would follow this contract:
//
//   PlayLiquidUnityClient
//     ├── Connect(worldBuildId) → fetches Scene API
//     ├── SubscribeToSSE() → receives authoritative state
//     ├── For each entity:
//     │     ├── Resolve declarative artifact
//     │     ├── Create PackageInstance (UnityAdapter)
//     │     ├── initialize → mount → update → render
//     │     └── KernelContext proxies to PlayLiquid server
//     └── Unity renders meshes; PlayLiquid owns state
//
// The adapter transforms PlayLiquid coordinates (right-handed, X=east,
// Y=up, Z=north) to Unity coordinates (left-handed, X=east, Y=up, Z=forward).

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
  DrawOpts,
  TextOpts,
  DrawOpts3D,
} from "../package-abi";
import { validateDeclarativeArtifact, createDeclarativeImplementation } from "./declarative-artifact";

// ── Unity coordinate transform ────────────────────────────────────
// PlayLiquid: right-handed (X=east, Y=up, Z=north)
// Unity: left-handed (X=east, Y=up, Z=forward)
// Transform: Z_PL → -Z_Unity (flip Z axis)
export function plToUnity(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z: -z };
}

export function unityToPL(x: number, y: number, z: number): { x: number; y: number; z: number } {
  return { x, y, z: -z };
}

// ── Unity Render Context (reference implementation) ───────────────
// This simulates what the Unity adapter would do: receive draw commands
// and translate them to Unity GameObjects. In the reference, we log
// the commands to prove the same artifact produces the same draw calls
// across adapters.
export class UnityRenderContext implements RenderContext {
  public screenX = 0;
  public screenY = 0;
  public worldX: number;
  public worldY: number;
  public worldZ: number;
  public scale: number;
  public selected: boolean;
  public commands: Array<{ cmd: string; args: number[]; opts: Record<string, unknown> }> = [];

  constructor(worldX: number, worldY: number, worldZ: number, scale: number, selected: boolean) {
    // Transform PL coords to Unity coords
    const unity = plToUnity(worldX, worldY, worldZ);
    this.worldX = unity.x;
    this.worldY = unity.y;
    this.worldZ = unity.z;
    this.scale = scale;
    this.selected = selected;
  }

  drawBox(w: number, h: number, d: number, opts: DrawOpts3D): void {
    this.commands.push({ cmd: "Instantiate(PrimitiveType.Cube)", args: [w, h, d], opts });
  }
  drawSphere(r: number, opts: DrawOpts3D): void {
    this.commands.push({ cmd: "Instantiate(PrimitiveType.Sphere)", args: [r], opts });
  }
  drawCylinder(rt: number, rb: number, h: number, opts: DrawOpts3D): void {
    this.commands.push({ cmd: "Instantiate(PrimitiveType.Cylinder)", args: [rt, rb, h], opts });
  }
  drawCone(r: number, h: number, opts: DrawOpts3D): void {
    this.commands.push({ cmd: "Instantiate(PrimitiveType.Capsule)", args: [r, h], opts });
  }
  drawMesh(_vertices: number[], _indices: number[], _opts: DrawOpts3D): void {}
  setPosition(x: number, y: number, z: number): void {
    const u = plToUnity(x, y, z);
    this.commands.push({ cmd: "transform.position", args: [u.x, u.y, u.z], opts: {} });
  }
  setRotation(x: number, y: number, z: number): void {
    this.commands.push({ cmd: "transform.rotation", args: [x, y, z], opts: {} });
  }
  setScale(s: number): void {
    this.commands.push({ cmd: "transform.localScale", args: [s], opts: {} });
  }
  drawText3D?(_x: number, _y: number, _z: number, _text: string, _opts: TextOpts): void {}

  // 2D commands (no-ops in Unity — Unity is 3D only)
  drawRect(): void {}
  drawCircle(): void {}
  drawLine(): void {}
  drawText(): void {}
  drawPath(): void {}
  pushTransform(): void {}
  popTransform(): void {}
}

// ── Unity Adapter: loads the same Scene API + declarative artifacts ──
export class UnityAdapter {
  private instances: Map<string, PackageInstance> = new Map();
  private contexts: Map<string, KernelContext> = new Map();

  async loadScene(sceneApiUrl: string): Promise<{
    entities: number;
    artifactsLoaded: number;
    commandsGenerated: Array<{ entityId: string; commands: Array<{ cmd: string; args: number[]; opts: Record<string, unknown> }> }>;
  }> {
    // Fetch the Scene API (same endpoint the Web runtime uses)
    const res = await fetch(sceneApiUrl);
    const scene = await res.json();

    const results: Array<{ entityId: string; commands: Array<{ cmd: string; args: number[]; opts: Record<string, unknown> }> }> = [];

    for (const entity of scene.entities) {
      const da = entity.declarativeArtifact;
      if (!da) continue;

      const validation = validateDeclarativeArtifact(da);
      if (!validation.valid || !validation.artifact) continue;

      const impl = createDeclarativeImplementation(validation.artifact);
      const instance = impl.createInstance();

      // Create a Unity-appropriate KernelContext
      const ctx: KernelContext = {
        entityId: entity.id,
        entityName: entity.name,
        getPosition: () => entity.position,
        requestMovement: () => {}, // Unity would send to PL server
        getState: () => entity.state,
        setState: () => {}, // Unity would send to PL server
        emit: () => {},
        on: () => {},
        invokeCapability: async () => ({ granted: true, action: "allow" }),
        requestService: async () => ({ ok: true }),
        log: () => {},
      };

      instance.initialize(ctx, {
        name: validation.artifact.name,
        displayName: validation.artifact.displayName,
        family: validation.artifact.family,
        version: "1.0.0",
        specification: {},
        capabilities: validation.artifact.capabilities,
        provides: [],
        requires: [],
      });
      instance.mount();
      instance.update(16);

      // Render through the Unity RenderContext
      const rc = new UnityRenderContext(
        entity.position.x, entity.position.y, entity.position.z, 1, false
      );
      instance.render(rc);

      results.push({ entityId: entity.id, commands: rc.commands });
      this.instances.set(entity.id, instance);
      this.contexts.set(entity.id, ctx);
    }

    return {
      entities: scene.entities.length,
      artifactsLoaded: results.length,
      commandsGenerated: results,
    };
  }
}

// ── World Node discovery + health (R8) ────────────────────────────
export interface WorldNodeHealth {
  nodeId: string;
  buildHash: string;
  buildVersion: number;
  status: string;
  entityCount: number;
  playerCount: number;
  uptime: number;
  host: string;
  protocolVersion: string;
  capabilities: Record<string, unknown>;
}

// ── Advertising service contract (R9) ─────────────────────────────
export interface AdPlacement {
  id: string;
  surface: string; // "billboard" | "kiosk" | "digital-screen" | "interstitial"
  worldAnchor: string; // semantic anchor where the ad appears
  frequencyCap: number; // max impressions per player per hour
  categoryFilter: string[];
  enabled: boolean;
}

export class AdService {
  private placements: Map<string, AdPlacement> = new Map();
  private impressions: Map<string, number[]> = new Map(); // playerId → timestamps

  registerPlacement(placement: AdPlacement): void {
    this.placements.set(placement.id, placement);
  }

  requestAd(playerId: string, placementId: string): { served: boolean; reason?: string; ad?: { placementId: string; content: string } } {
    const placement = this.placements.get(placementId);
    if (!placement) return { served: false, reason: "Placement not found" };
    if (!placement.enabled) return { served: false, reason: "Placement disabled" };

    // R9: Frequency cap enforcement — OS service, not package
    const now = Date.now();
    const hourAgo = now - 3600000;
    const playerImpressions = (this.impressions.get(playerId) ?? []).filter((t) => t > hourAgo);

    if (playerImpressions.length >= placement.frequencyCap) {
      return { served: false, reason: `Frequency cap reached (${placement.frequencyCap}/hour)` };
    }

    playerImpressions.push(now);
    this.impressions.set(playerId, playerImpressions);

    return {
      served: true,
      ad: {
        placementId,
        content: `Ad served on ${placement.surface} at ${placement.worldAnchor}`,
      },
    };
  }

  getPlacements(): AdPlacement[] {
    return Array.from(this.placements.values());
  }
}
