// ════════════════════════════════════════════════════════════════
// SPINNING MARKER — Canonical ABI Conformance Test Package
// ════════════════════════════════════════════════════════════════
//
// Phase A: uses createInstance() factory — each entity gets its own
// instance with isolated state. No global _ctx singletons.
// Uses engine-agnostic RenderContext draw commands.

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
} from "../package-abi";

// The instance — one per entity, with its own ctx
class SpinningMarkerInstance implements PackageInstance {
  private ctx: KernelContext | null = null;

  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    this.ctx = ctx;
    ctx.setState({ rotation: 0, spinSpeed: 0.02, color: "#fbbf24" });
    ctx.log("info", `SpinningMarker initialized on entity ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      const state = ctx.getState();
      ctx.emit("marker.clicked", { entityId: ctx.entityId, rotation: state.rotation });
    });
  }

  mount(): void {
    this.ctx?.log("info", "SpinningMarker mounted");
  }

  update(delta: number): void {
    if (!this.ctx) return;
    const state = this.ctx.getState();
    const rotation = (state.rotation as number) ?? 0;
    const spinSpeed = (state.spinSpeed as number) ?? 0.02;
    this.ctx.setState({ rotation: rotation + spinSpeed * (delta / 16) });
  }

  handle(event: string): void {
    this.ctx?.log("info", `SpinningMarker received: ${event}`);
  }

  render(rc: RenderContext): void {
    if (!this.ctx) return;
    const state = this.ctx.getState();
    const rotation = (state.rotation as number) ?? 0;
    const color = (state.color as string) ?? "#fbbf24";
    const size = 12;

    rc.pushTransform(rc.screenX, rc.screenY, rotation, 1);
    rc.drawRect(-size, -size, size * 2, size * 2, {
      fill: color,
      stroke: rc.selected ? "#ffffff" : color,
      strokeWidth: rc.selected ? 2 : 1,
    });
    rc.drawLine(0, 0, size, 0, { stroke: "rgba(255,255,255,0.5)", strokeWidth: 1.5 });
    rc.popTransform();
  }

  dispose(): void {
    this.ctx?.log("info", "SpinningMarker disposed");
    this.ctx = null;
  }
}

// The implementation — a factory that creates instances
export const SpinningMarkerImplementation: PackageImplementation = {
  target: "playliquid-web",
  abiVersion: "1.0.0",
  capabilities: ["rotate", "marker.click"],
  createInstance: () => new SpinningMarkerInstance(),
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
    description: "Canonical ABI conformance test. Each entity gets its own instance.",
    capabilities: ["rotate", "marker.click"],
    provides: [{ name: "spatial.anchor", family: "spatial" }],
    requires: [{ name: "spatial.anchor", family: "spatial" }],
    spatial: { scale: "small", anchorable: true },
  },
  capabilities: ["rotate", "marker.click"],
  provides: ["spatial.anchor"],
  requires: ["spatial.anchor"],
};
