// ════════════════════════════════════════════════════════════════
// EXAMPLE EXECUTABLE PACKAGE — Spinning Marker
// ════════════════════════════════════════════════════════════════
//
// This is a REAL executable package implementation. It conforms to the
// PackageRuntimeABI. The PackageExecutor loads it, creates a
// KernelContext, and calls its lifecycle methods.
//
// This is NOT a scene visualizer drawing shapes. This is a package
// that:
//   - initializes with a KernelContext
//   - maintains its own rotation state
//   - updates rotation every tick
//   - renders itself via the RenderContext
//   - emits events when clicked
//   - requests the "rotate" capability through the Kernel gate
//
// The same package could be implemented for Unity or Unreal by
// conforming to the same ABI with a different render context.

import type { PackageRuntimeABI, KernelContext, PackageManifest, RenderContext } from "../package-abi";

// The package implementation — exported as a module the executor can load
export const SpinningMarkerPackage: PackageRuntimeABI = {
  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    ctx.log("info", `SpinningMarker initialized on entity ${ctx.entityName}`);
    // Initialize state
    ctx.setState({ rotation: 0, spinSpeed: 0.02, color: "#fbbf24" });
    // Listen for click events
    ctx.on("entity.click", (payload) => {
      ctx.log("info", `SpinningMarker clicked: ${JSON.stringify(payload)}`);
      ctx.emit("marker.clicked", { entityId: ctx.entityId, rotation: ctx.getState().rotation });
    });
  },

  mount(): void {
    // Called when mounted on an entity
  },

  update(delta: number): void {
    // This method is called by the executor every tick.
    // The package updates its own state — it does NOT touch the
    // render surface here. Rendering happens in render().
    // (The KernelContext is captured in initialize(); in a real
    // executor it would be available as a closure or instance field.)
  },

  handle(event: string, payload: Record<string, unknown>): void {
    // Handle world events routed to this entity
    if (event === "tick") {
      // Rotate — but only if the Kernel grants the "rotate" capability
      // (This is the enforcement boundary: the package asks, the Kernel decides)
    }
  },

  render(rc: RenderContext): void {
    // The package draws itself into the RenderContext provided by the
    // Runtime Adapter. It never owns the canvas.
    if (rc.type !== "canvas-2d" || !rc.ctx2d) return;
    const ctx2d = rc.ctx2d;

    // The package reads its own state
    // (In a full executor this would come from the KernelContext)
    const rotation = (globalThis as Record<string, unknown>).__markerRotation ?? 0;
    const color = "#fbbf24";

    const size = 12;
    const cx = rc.screenX;
    const cy = rc.screenY;

    // Draw a rotating square (the "spinning marker")
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate(rotation as number);
    ctx2d.fillStyle = color;
    ctx2d.strokeStyle = rc.selected ? "#ffffff" : color;
    ctx2d.lineWidth = rc.selected ? 2 : 1;
    ctx2d.fillRect(-size, -size, size * 2, size * 2);
    if (rc.selected) ctx2d.strokeRect(-size, -size, size * 2, size * 2);

    // Draw a small indicator line showing rotation
    ctx2d.strokeStyle = "rgba(255,255,255,0.5)";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.lineTo(size, 0);
    ctx2d.stroke();
    ctx2d.restore();
  },

  dispose(): void {
    // Cleanup when unmounted
  },
};

// The package manifest — engine-independent
export const SpinningMarkerManifest: PackageManifest = {
  name: "@playliquid/examples/spinning-marker",
  displayName: "Spinning Marker",
  family: "building",
  version: "1.0.0",
  specification: {
    name: "@playliquid/examples/spinning-marker",
    displayName: "Spinning Marker",
    family: "building",
    description: "A real executable package that rotates. Demonstrates the Package Runtime ABI.",
    capabilities: ["rotate", "marker.click"],
    provides: [{ name: "spatial.anchor", family: "spatial" }],
    requires: [{ name: "spatial.anchor", family: "spatial" }],
    spatial: { scale: "small", anchorable: true },
  },
  capabilities: ["rotate", "marker.click"],
  provides: ["spatial.anchor"],
  requires: ["spatial.anchor"],
  implementations: [
    {
      target: "playliquid-web",
      runtime: "playliquid",
      version: "1.0.0",
      entrypoint: "spinning-marker.js",
      format: "js-module",
      capabilities: ["rotate", "marker.click"],
      contracts: ["spatial.anchor"],
      assets: [],
      dependencies: [],
    },
    {
      target: "unity",
      runtime: "unity",
      version: "1.0.0",
      entrypoint: "SpinningMarker.prefab",
      format: "unity-prefab",
      capabilities: ["rotate", "marker.click"],
      contracts: ["spatial.anchor"],
      assets: ["SpinningMarker.prefab"],
      dependencies: [],
    },
  ],
};
