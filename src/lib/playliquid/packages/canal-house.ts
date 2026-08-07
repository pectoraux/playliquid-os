// ════════════════════════════════════════════════════════════════
// CANAL HOUSE — executable building package (instance-isolated)
// ════════════════════════════════════════════════════════════════

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
} from "../package-abi";

class CanalHouseInstance implements PackageInstance {
  private ctx: KernelContext | null = null;

  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    this.ctx = ctx;
    ctx.setState({ occupied: false, floors: 4, color: "#fbbf24", roofColor: "#8b4513" });
    ctx.log("info", `CanalHouse initialized on ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      const state = ctx.getState();
      const occupied = (state.occupied as boolean) ?? false;
      ctx.invokeCapability("building.enter").then((result) => {
        if (result.granted) {
          ctx.setState({ occupied: !occupied });
          ctx.emit(!occupied ? "building.occupied" : "building.vacated", { entityId: ctx.entityId });
        } else {
          ctx.log("warn", `Building enter denied: ${result.action}`);
        }
      });
    });
  }

  mount(): void {
    this.ctx?.log("info", "CanalHouse mounted");
  }

  update(): void {
    // Static building
  }

  handle(event: string): void {
    this.ctx?.log("info", `CanalHouse received: ${event}`);
  }

  render(rc: RenderContext): void {
    if (!this.ctx) return;
    const state = this.ctx.getState();
    const occupied = (state.occupied as boolean) ?? false;
    const color = occupied ? "#86efac" : ((state.color as string) ?? "#fbbf24");
    const roofColor = (state.roofColor as string) ?? "#8b4513";
    const floors = (state.floors as number) ?? 4;
    const w = 16, h = 20;
    const cx = rc.screenX, cy = rc.screenY;

    // Body
    rc.drawRect(cx - w / 2, cy - h / 2, w, h, {
      fill: color,
      stroke: rc.selected ? "#ffffff" : "rgba(0,0,0,0.3)",
      strokeWidth: rc.selected ? 2 : 1,
    });

    // Roof
    rc.drawPath([
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx, y: cy - h / 2 - 6 },
      { x: cx + w / 2, y: cy - h / 2 },
    ], { fill: roofColor, stroke: roofColor });

    // Windows
    for (let i = 0; i < floors; i++) {
      const wy = cy - h / 2 + 4 + i * (h / floors);
      rc.drawRect(cx - 3, wy, 2, 2, { fill: occupied ? "#fef08a" : "rgba(255,255,255,0.3)" });
      rc.drawRect(cx + 1, wy, 2, 2, { fill: occupied ? "#fef08a" : "rgba(255,255,255,0.3)" });
    }

    // Occupied indicator
    if (occupied) {
      rc.drawCircle(cx + w / 2 + 3, cy - h / 2 + 3, 2, { fill: "#22c55e" });
    }
  }

  dispose(): void {
    this.ctx?.log("info", "CanalHouse disposed");
    this.ctx = null;
  }
}

export const CanalHouseImplementation: PackageImplementation = {
  target: "playliquid-web",
  abiVersion: "1.0.0",
  capabilities: ["building.enter", "building.window", "building.roof"],
  createInstance: () => new CanalHouseInstance(),
};

export const CanalHouseManifest: PackageManifest = {
  name: "@playliquid/buildings/canal-house-executable",
  displayName: "Canal House (Executable)",
  family: "building",
  version: "1.0.0",
  specification: {
    name: "@playliquid/buildings/canal-house-executable",
    displayName: "Canal House",
    family: "building",
    description: "Executable building. Each entity gets its own instance.",
    capabilities: ["building.enter", "building.window", "building.roof"],
    provides: [{ name: "spatial.anchor", family: "spatial" }],
    requires: [{ name: "navigation.walkable", family: "navigation" }],
    spatial: { scale: "medium", anchorable: true, floors: 4 },
  },
  capabilities: ["building.enter", "building.window", "building.roof"],
  provides: ["spatial.anchor"],
  requires: ["navigation.walkable"],
};
