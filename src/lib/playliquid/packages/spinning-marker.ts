// ════════════════════════════════════════════════════════════════
// SPINNING MARKER — Canonical ABI Conformance Test Package
// ════════════════════════════════════════════════════════════════
//
// This package is the canonical proof that the Package Runtime ABI works.
// It does NOT use globalThis or any escape hatch. All state flows through
// the KernelContext:
//
//   initialize(ctx) → ctx.setState({ rotation: 0, spinSpeed })
//   update(delta)   → ctx.getState() → ctx.setState({ rotation: ... })
//   render(rc)      → reads rotation from ctx state (passed via rc)
//   handle(event)   → ctx.emit() on click
//
// The package NEVER touches:
//   - the canvas directly (only via RenderContext)
//   - globalThis or any global state
//   - networking, storage, or other entities

import type { PackageRuntimeABI, KernelContext, PackageManifest, RenderContext } from "../package-abi";

// The package needs to hold its KernelContext between lifecycle calls.
// This is the standard pattern: the executor calls initialize() with ctx,
// and the package stores it in a closure/instance for later use.
let _ctx: KernelContext | null = null;

export const SpinningMarkerPackage: PackageRuntimeABI = {
  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    _ctx = ctx;
    // Initialize state through the KernelContext — no globals
    ctx.setState({ rotation: 0, spinSpeed: 0.02, color: "#fbbf24" });
    ctx.log("info", `SpinningMarker initialized on entity ${ctx.entityName}`);
    // Listen for click events through the KernelContext
    ctx.on("entity.click", () => {
      const state = ctx.getState();
      ctx.emit("marker.clicked", { entityId: ctx.entityId, rotation: state.rotation });
      ctx.log("info", `Marker clicked at rotation ${state.rotation?.toFixed(2)}`);
    });
  },

  mount(): void {
    _ctx?.log("info", "SpinningMarker mounted");
  },

  update(delta: number): void {
    if (!_ctx) return;
    // Read state through KernelContext — no globalThis
    const state = _ctx.getState();
    const rotation = (state.rotation as number) ?? 0;
    const spinSpeed = (state.spinSpeed as number) ?? 0.02;
    // Update rotation based on delta time
    const newRotation = rotation + spinSpeed * (delta / 16);
    // Write state through KernelContext
    _ctx.setState({ rotation: newRotation });
  },

  handle(event: string, _payload: Record<string, unknown>): void {
    if (!_ctx) return;
    // Handle world events routed to this entity
    _ctx.log("info", `SpinningMarker received event: ${event}`);
  },

  render(rc: RenderContext): void {
    if (rc.type !== "canvas-2d" || !rc.ctx2d || !_ctx) return;
    const ctx2d = rc.ctx2d;
    // Read state through KernelContext — no globalThis.__markerRotation
    const state = _ctx.getState();
    const rotation = (state.rotation as number) ?? 0;
    const color = (state.color as string) ?? "#fbbf24";

    const size = 12;
    const cx = rc.screenX;
    const cy = rc.screenY;

    // Draw a rotating square
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate(rotation);
    ctx2d.fillStyle = color;
    ctx2d.strokeStyle = rc.selected ? "#ffffff" : color;
    ctx2d.lineWidth = rc.selected ? 2 : 1;
    ctx2d.fillRect(-size, -size, size * 2, size * 2);
    if (rc.selected) ctx2d.strokeRect(-size, -size, size * 2, size * 2);

    // Indicator line showing rotation
    ctx2d.strokeStyle = "rgba(255,255,255,0.5)";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(0, 0);
    ctx2d.lineTo(size, 0);
    ctx2d.stroke();
    ctx2d.restore();
  },

  dispose(): void {
    _ctx?.log("info", "SpinningMarker disposed");
    _ctx = null;
  },
};

export const SpinningMarkerManifest: PackageManifest = {
  name: "@playliquid/examples/spinning-marker",
  displayName: "Spinning Marker",
  family: "building",
  version: "1.0.0",
  specification: {
    name: "@playliquid/examples/spinning-marker",
    displayName: "Spinning Marker",
    family: "building",
    description: "Canonical ABI conformance test. Rotates using KernelContext state — no globalThis escape hatches.",
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
