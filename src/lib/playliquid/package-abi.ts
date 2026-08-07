// ════════════════════════════════════════════════════════════════
// PLAYLIQUID PACKAGE RUNTIME ABI — the frozen execution boundary
// ════════════════════════════════════════════════════════════════
//
// This is the single most important contract in the OS. It defines the
// boundary between a Package implementation and the PlayLiquid Kernel.
//
// A package implementation NEVER directly touches:
//   - multiplayer / networking / replication
//   - other players
//   - persistence
//   - world authority
//   - capability permissions
//   - spatial identity
//   - ads / economy / identity
//
// Instead it interacts with the OS exclusively through the KernelContext,
// which the Kernel provides. The OS owns the world; the package owns the
// behavior.
//
//   Package Implementation
//       │
//       ▼
//   Package Runtime ABI (this interface)
//       │
//       ▼
//   KernelContext (what the Kernel exposes to the package)
//       │
//       ▼
//   Kernel / World Services / World State
//       │
//       ▼
//   Browser / Mobile / Unity / Unreal (Runtime Adapter)

// ── The KernelContext: what the Kernel exposes to a package ────────
// This is the ONLY surface a package implementation can use to interact
// with the world. It deliberately does NOT expose networking, other
// players, persistence internals, or capability internals.
export interface KernelContext {
  // The entity this package instance is mounted on
  entityId: string;
  entityName: string;

  // Spatial — the package can READ its position but cannot set it
  // directly. It requests movement via `requestMovement`, which the
  // Kernel may deny based on capability policy.
  getPosition(): { x: number; y: number; z: number };
  requestMovement(delta: { x: number; y: number; z: number }): void;

  // State — the package owns its entity's state. The Kernel
  // persists + replicates it; the package reads + writes it.
  getState(): Record<string, unknown>;
  setState(patch: Record<string, unknown>): void;

  // Events — the package can emit + receive events. The Kernel
  // routes them; the package never touches the transport.
  emit(event: string, payload: Record<string, unknown>): void;
  on(event: string, handler: (payload: Record<string, unknown>) => void): void;

  // Capabilities — the package requests capabilities. The Kernel
  // negotiates (entity × world × zone × experience) and returns
  // ALLOW / DENY / LIMIT. There is NO direct path to execution.
  invokeCapability(
    capability: string,
    args?: Record<string, unknown>
  ): Promise<{ granted: boolean; action: "allow" | "deny" | "limit"; params?: Record<string, unknown> }>;

  // Services — the package can request OS services (multiplayer,
  // persistence, ads, economy, etc.) through a controlled interface.
  // It never implements them.
  requestService(
    service: string,
    action: string,
    params?: Record<string, unknown>
  ): Promise<unknown>;

  // Logging — for observability. The Kernel routes logs.
  log(level: "info" | "warn" | "error", message: string): void;
}

// ── The Package Runtime ABI: the frozen lifecycle ─────────────────
// Every executable package implementation must conform to this interface.
// The Kernel calls these methods; the package responds.
export interface PackageRuntimeABI {
  // Called once when the package is loaded. The package receives the
  // KernelContext and its own specification + manifest.
  initialize(ctx: KernelContext, manifest: PackageManifest): void;

  // Called when the package is mounted on an entity.
  mount(): void;

  // Called every simulation tick. delta = milliseconds since last tick.
  update(delta: number): void;

  // Called when a world event reaches this entity.
  handle(event: string, payload: Record<string, unknown>): void;

  // Called when the package needs to render. The render context is
  // provided by the Runtime Adapter (canvas, WebGL, Unity, etc.).
  // The package draws into it; it never owns the render surface.
  render(rc: RenderContext): void;

  // Called when the package is unmounted from an entity.
  dispose(): void;
}

// ── What a Package Implementation IS ──────────────────────────────
// A canonical Package has a Specification (engine-independent). A
// Package Implementation is the executable artifact that conforms to
// the PackageRuntimeABI. One package can have multiple implementations
// (playliquid-web, unity, unreal) — all conforming to the same ABI.
export interface PackageImplementation {
  target: string; // "playliquid-web" | "playliquid-mobile" | "unity" | "unreal"
  runtime: string; // "playliquid" | "unity" | "unreal"
  version: string; // ABI version this implementation targets
  entrypoint: string; // how to load this implementation
  format: string; // "js-module" | "unity-prefab" | "unreal-asset"
  // What this implementation provides (capabilities + contracts)
  capabilities: string[];
  contracts: string[];
  // Assets the implementation needs
  assets: string[];
  // Other package implementations this one depends on
  dependencies: string[];
}

// ── The Package Manifest (engine-independent) ─────────────────────
export interface PackageManifest {
  name: string;
  displayName: string;
  family: string;
  version: string;
  specification: Record<string, unknown>;
  capabilities: string[];
  provides: string[];
  requires: string[];
  implementations: PackageImplementation[];
}

// ── The Render Context (provided by the Runtime Adapter) ──────────
// The package draws into this; it never owns the canvas/scene. This
// makes the renderer replaceable — the same package can render to
// canvas, WebGL, or a Unity scene.
export interface RenderContext {
  // The type of render context (canvas-2d, webgl, unity, unreal)
  type: string;
  // For canvas-2d: the 2D context
  ctx2d?: CanvasRenderingContext2D;
  // The entity's screen position (pre-computed by the adapter)
  screenX: number;
  screenY: number;
  // The world position (for 3D adapters)
  worldX: number;
  worldY: number;
  worldZ: number;
  // Scale factor (world units → screen pixels)
  scale: number;
  // Whether this entity is selected (for highlight)
  selected: boolean;
}

// ── Package Executor: loads + runs package implementations ────────
// The executor is the bridge between the Kernel and the package. It:
//   1. loads the package implementation (JS module, Unity prefab, etc.)
//   2. creates the KernelContext for the entity
//   3. calls initialize() / mount() / update() / render() / dispose()
//   4. enforces the ABI boundary (packages can't escape it)
export interface PackageExecutor {
  // Load a package implementation for a given target
  load(impl: PackageImplementation): Promise<PackageRuntimeABI>;
  // Check if an implementation is available for a target
  isAvailable(target: string): boolean;
}
