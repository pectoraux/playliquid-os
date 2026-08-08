// ════════════════════════════════════════════════════════════════
// PLAYLIQUID PACKAGE RUNTIME ABI — the frozen execution boundary
// ════════════════════════════════════════════════════════════════
//
// This is the single most important contract in the OS. It defines the
// boundary between a Package implementation and the PlayLiquid Kernel.
//
// Phase A improvements:
//   - PackageImplementation is now a FACTORY: createInstance() returns a
//     new PackageInstance per entity. No singletons. 10,000 walkers each
//     get independent state.
//   - RenderContext is now ENGINE-AGNOSTIC: no canvas-specific types.
//     It exposes draw commands (drawRect, drawCircle, drawText, etc.)
//     that each adapter (canvas, WebGL, Unity, Unreal) translates.
//   - The Kernel owns authoritative state. Packages define+mutate
//     through KernelContext, but the Kernel is the state authority.

// ── The KernelContext: what the Kernel exposes to a package ────────
export interface KernelContext {
  entityId: string;
  entityName: string;

  // Spatial — the package can READ its position. Movement is a REQUEST;
  // the Kernel owns authoritative position and may deny.
  getPosition(): { x: number; y: number; z: number };
  requestMovement(delta: { x: number; y: number; z: number }): void;

  // State — the package defines+mutates logical state. The Kernel owns
  // authoritative state (persists, replicates, resolves conflicts).
  getState(): Record<string, unknown>;
  setState(patch: Record<string, unknown>): void;

  // Events — Kernel routes; package never touches transport.
  emit(event: string, payload: Record<string, unknown>): void;
  on(event: string, handler: (payload: Record<string, unknown>) => void): void;

  // Capabilities — Kernel gate. No direct path to execution.
  invokeCapability(
    capability: string,
    args?: Record<string, unknown>
  ): Promise<{ granted: boolean; action: "allow" | "deny" | "limit"; params?: Record<string, unknown> }>;

  // Services — OS services (multiplayer, persistence, ads, economy).
  requestService(
    service: string,
    action: string,
    params?: Record<string, unknown>
  ): Promise<unknown>;

  // Logging
  log(level: "info" | "warn" | "error", message: string): void;

  // Deterministic randomness — packages use this instead of Math.random()
  // for reproducible worlds. Same seed → same sequence. Provided by the
  // ResourceGuard so certification can verify determinism.
  deterministicRandom?(): number;
}

// ── The engine-agnostic RenderContext ─────────────────────────────
// Supports both 2D and 3D draw commands. The package issues draw
// commands; the adapter (canvas-2d, Three.js/WebGL, Unity, Unreal)
// translates them. The package never knows what engine renders it.
export interface RenderContext {
  // The entity's position in world space (3D)
  worldX: number;
  worldY: number;
  worldZ: number;
  scale: number;
  selected: boolean;

  // ── 2D draw commands (for canvas-2d adapters) ──
  screenX: number;
  screenY: number;
  drawRect(x: number, y: number, w: number, h: number, opts: DrawOpts): void;
  drawCircle(x: number, y: number, r: number, opts: DrawOpts): void;
  drawLine(x1: number, y1: number, x2: number, y2: number, opts: DrawOpts): void;
  drawText(x: number, y: number, text: string, opts: TextOpts): void;
  drawPath(points: Array<{ x: number; y: number }>, opts: DrawOpts): void;
  pushTransform(x: number, y: number, rotation: number, scale: number): void;
  popTransform(): void;

  // ── 3D draw commands (for Three.js/WebGL/Unity adapters) ──
  drawBox?(w: number, h: number, d: number, opts: DrawOpts3D): void;
  drawSphere?(r: number, opts: DrawOpts3D): void;
  drawCylinder?(rt: number, rb: number, h: number, opts: DrawOpts3D): void;
  drawCone?(r: number, h: number, opts: DrawOpts3D): void;
  drawMesh?(vertices: number[], indices: number[], opts: DrawOpts3D): void;
  setPosition?(x: number, y: number, z: number): void;
  setRotation?(x: number, y: number, z: number): void;
  setScale?(s: number): void;
  drawText3D?(x: number, y: number, z: number, text: string, opts: TextOpts): void;
}

export interface DrawOpts3D {
  color: string;
  emissive?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  wireframe?: boolean;
}

export interface DrawOpts {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export interface TextOpts {
  color?: string;
  font?: string;
  size?: number;
  align?: "left" | "center" | "right";
}

// ── PackageInstance: one per entity ───────────────────────────────
// Phase A fix: each entity gets its own instance with isolated state.
// No global _ctx singletons.
export interface PackageInstance {
  initialize(ctx: KernelContext, manifest: PackageManifest): void;
  mount(): void;
  update(delta: number): void;
  handle(event: string, payload: Record<string, unknown>): void;
  render(rc: RenderContext): void;
  dispose(): void;
}

// ── PackageImplementation: a factory that creates instances ───────
// Phase A fix: the implementation is a FACTORY, not a singleton.
// Each entity calls createInstance() to get its own PackageInstance.
export interface PackageImplementation {
  // The runtime target this implementation supports
  target: string; // "playliquid-web" | "playliquid-mobile" | "unity" | "unreal"

  // Create a new isolated instance for one entity
  createInstance(): PackageInstance;

  // Metadata for validation
  readonly abiVersion: string;
  readonly capabilities: string[];
}

// ── Package Manifest (engine-independent) ─────────────────────────
export interface PackageManifest {
  name: string;
  displayName: string;
  family: string;
  version: string;
  specification: Record<string, unknown>;
  capabilities: string[];
  provides: string[];
  requires: string[];
}

// ── RuntimeArtifact loader interface ──────────────────────────────
// Phase A fix: the loader resolves implementations from RuntimeArtifacts,
// not a hard-coded Map. Each adapter implements this.
export interface RuntimeArtifactLoader {
  // Load a PackageImplementation from a RuntimeArtifact for a given target
  load(artifactUri: string, target: string): Promise<PackageImplementation | null>;
  // Check if an artifact is available for a target
  isAvailable(artifactUri: string, target: string): boolean;
}

// ── Artifact validation (ABI conformance checker) ─────────────────
export interface ArtifactValidator {
  // Validate that an artifact conforms to the Package Runtime ABI
  validate(artifact: unknown): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  // The parsed implementation if valid
  implementation?: PackageImplementation;
}
