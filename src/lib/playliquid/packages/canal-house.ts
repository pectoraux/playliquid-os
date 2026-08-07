// ════════════════════════════════════════════════════════════════
// CANAL HOUSE — executable building package
// ════════════════════════════════════════════════════════════════
//
// A real building package. It:
//   - maintains "occupied" state (toggles when clicked)
//   - emits "building.occupied" / "building.vacated" events
//   - requests the "building.enter" capability
//   - renders as a square with window indicators
//   - all state through KernelContext

import type { PackageRuntimeABI, KernelContext, PackageManifest, RenderContext } from "../package-abi";

let _ctx: KernelContext | null = null;

export const CanalHousePackage: PackageRuntimeABI = {
  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    _ctx = ctx;
    ctx.setState({ occupied: false, floors: 4, windowCount: 14, color: "#fbbf24", roofColor: "#8b4513" });
    ctx.log("info", `CanalHouse initialized on ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      const state = ctx.getState();
      const occupied = (state.occupied as boolean) ?? false;
      // Toggle occupancy — but request the "building.enter" capability first
      ctx.invokeCapability("building.enter").then((result) => {
        if (result.granted) {
          const newOccupied = !occupied;
          ctx.setState({ occupied: newOccupied });
          ctx.emit(newOccupied ? "building.occupied" : "building.vacated", { entityId: ctx.entityId });
          ctx.log("info", `CanalHouse ${newOccupied ? "occupied" : "vacated"}`);
        } else {
          ctx.log("warn", `Building enter denied: ${result.action}`);
        }
      });
    });
  },

  mount(): void {
    _ctx?.log("info", "CanalHouse mounted");
  },

  update(_delta: number): void {
    // Buildings are static — no per-tick state changes
    // (But the method must exist per the ABI)
  },

  handle(event: string, _payload: Record<string, unknown>): void {
    if (!_ctx) return;
    _ctx.log("info", `CanalHouse received event: ${event}`);
  },

  render(rc: RenderContext): void {
    if (rc.type !== "canvas-2d" || !rc.ctx2d || !_ctx) return;
    const ctx2d = rc.ctx2d;
    const state = _ctx.getState();
    const occupied = (state.occupied as boolean) ?? false;
    const color = occupied ? "#86efac" : ((state.color as string) ?? "#fbbf24");
    const roofColor = (state.roofColor as string) ?? "#8b4513";
    const floors = (state.floors as number) ?? 4;

    const w = 16;
    const h = 20;
    const cx = rc.screenX;
    const cy = rc.screenY;

    // Building body
    ctx2d.fillStyle = color;
    ctx2d.strokeStyle = rc.selected ? "#ffffff" : "rgba(0,0,0,0.3)";
    ctx2d.lineWidth = rc.selected ? 2 : 1;
    ctx2d.fillRect(cx - w / 2, cy - h / 2, w, h);
    if (rc.selected) ctx2d.strokeRect(cx - w / 2, cy - h / 2, w, h);

    // Roof (triangle)
    ctx2d.fillStyle = roofColor;
    ctx2d.beginPath();
    ctx2d.moveTo(cx - w / 2, cy - h / 2);
    ctx2d.lineTo(cx, cy - h / 2 - 6);
    ctx2d.lineTo(cx + w / 2, cy - h / 2);
    ctx2d.closePath();
    ctx2d.fill();

    // Windows (small dots, one per floor)
    ctx2d.fillStyle = occupied ? "#fef08a" : "rgba(255,255,255,0.3)";
    for (let i = 0; i < floors; i++) {
      const wy = cy - h / 2 + 4 + i * (h / floors);
      ctx2d.fillRect(cx - 3, wy, 2, 2);
      ctx2d.fillRect(cx + 1, wy, 2, 2);
    }

    // Occupied indicator
    if (occupied) {
      ctx2d.fillStyle = "#22c55e";
      ctx2d.beginPath();
      ctx2d.arc(cx + w / 2 + 3, cy - h / 2 + 3, 2, 0, Math.PI * 2);
      ctx2d.fill();
    }
  },

  dispose(): void {
    _ctx?.log("info", "CanalHouse disposed");
    _ctx = null;
  },
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
    description: "An executable building that toggles occupancy when clicked, requesting the building.enter capability through the Kernel.",
    capabilities: ["building.enter", "building.window", "building.roof"],
    provides: [{ name: "spatial.anchor", family: "spatial" }],
    requires: [{ name: "navigation.walkable", family: "navigation" }],
    spatial: { scale: "medium", anchorable: true, floors: 4 },
  },
  capabilities: ["building.enter", "building.window", "building.roof"],
  provides: ["spatial.anchor"],
  requires: ["navigation.walkable"],
  implementations: [
    {
      target: "playliquid-web",
      runtime: "playliquid",
      version: "1.0.0",
      entrypoint: "canal-house.js",
      format: "js-module",
      capabilities: ["building.enter", "building.window", "building.roof"],
      contracts: ["spatial.anchor"],
      assets: [],
      dependencies: [],
    },
    {
      target: "unity",
      runtime: "unity",
      version: "1.0.0",
      entrypoint: "CanalHouse.prefab",
      format: "unity-prefab",
      capabilities: ["building.enter", "building.window", "building.roof"],
      contracts: ["spatial.anchor"],
      assets: ["CanalHouse.prefab"],
      dependencies: [],
    },
  ],
};
