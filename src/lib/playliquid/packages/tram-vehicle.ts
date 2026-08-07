// ════════════════════════════════════════════════════════════════
// TRAM VEHICLE — executable vehicle package
// ════════════════════════════════════════════════════════════════
//
// A real vehicle package. It:
//   - moves along a path using requestMovement
//   - maintains "passengers" state
//   - emits "vehicle.boarded" / "vehicle.exited" events
//   - requests the "vehicle.drive" capability
//   - renders as a rectangle with direction + passenger count
//   - all state through KernelContext

import type { PackageRuntimeABI, KernelContext, PackageManifest, RenderContext } from "../package-abi";

let _ctx: KernelContext | null = null;
let _tickCount = 0;

export const TramVehiclePackage: PackageRuntimeABI = {
  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    _ctx = ctx;
    ctx.setState({
      routeProgress: 0,
      speed: 0.3,
      passengers: 3,
      maxPassengers: 20,
      color: "#7dd3fc",
      direction: 0,
    });
    ctx.log("info", `TramVehicle initialized on ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      const state = ctx.getState();
      const passengers = (state.passengers as number) ?? 0;
      const max = (state.maxPassengers as number) ?? 20;
      // Board a passenger — request the "vehicle.board" capability
      ctx.invokeCapability("vehicle.board").then((result) => {
        if (result.granted && passengers < max) {
          ctx.setState({ passengers: passengers + 1 });
          ctx.emit("vehicle.boarded", { entityId: ctx.entityId, passengers: passengers + 1 });
          ctx.log("info", `Passenger boarded (${passengers + 1}/${max})`);
        } else if (!result.granted) {
          ctx.log("warn", `Boarding denied: ${result.action}`);
        } else {
          ctx.log("warn", "Tram is full");
        }
      });
    });
  },

  mount(): void {
    _ctx?.log("info", "TramVehicle mounted");
  },

  update(delta: number): void {
    if (!_ctx) return;
    _tickCount++;
    const state = _ctx.getState();
    const progress = (state.routeProgress as number) ?? 0;
    const speed = (state.speed as number) ?? 0.3;
    const direction = (state.direction as number) ?? 0;

    // Move along a route — request movement through the Kernel
    const newProgress = (progress + speed * (delta / 16) * 0.01) % 1;
    _ctx.setState({ routeProgress: newProgress });

    // Every ~90 ticks, request movement
    if (_tickCount % 90 === 0) {
      const dx = Math.cos(direction + newProgress * Math.PI * 2) * speed;
      const dz = Math.sin(direction + newProgress * Math.PI * 2) * speed;
      _ctx.requestMovement({ x: dx, y: 0, z: dz });
      _ctx.emit("vehicle.moved", { entityId: _ctx.entityId, progress: newProgress });
    }
  },

  handle(event: string, _payload: Record<string, unknown>): void {
    if (!_ctx) return;
    _ctx.log("info", `TramVehicle received event: ${event}`);
  },

  render(rc: RenderContext): void {
    if (rc.type !== "canvas-2d" || !rc.ctx2d || !_ctx) return;
    const ctx2d = rc.ctx2d;
    const state = _ctx.getState();
    const passengers = (state.passengers as number) ?? 0;
    const max = (state.maxPassengers as number) ?? 20;
    const color = (state.color as string) ?? "#7dd3fc";
    const progress = (state.routeProgress as number) ?? 0;

    const w = 18;
    const h = 8;
    const cx = rc.screenX;
    const cy = rc.screenY;
    const angle = progress * Math.PI * 2;

    // Draw tram as a rounded rectangle rotated by progress
    ctx2d.save();
    ctx2d.translate(cx, cy);
    ctx2d.rotate(angle);
    ctx2d.fillStyle = color;
    ctx2d.strokeStyle = rc.selected ? "#ffffff" : "rgba(0,0,0,0.3)";
    ctx2d.lineWidth = rc.selected ? 2 : 1;
    ctx2d.beginPath();
    ctx2d.roundRect(-w / 2, -h / 2, w, h, 2);
    ctx2d.fill();
    if (rc.selected) ctx2d.stroke();

    // Windows
    ctx2d.fillStyle = "rgba(255,255,255,0.4)";
    for (let i = 0; i < 3; i++) {
      ctx2d.fillRect(-w / 2 + 3 + i * 5, -h / 2 + 2, 3, h - 4);
    }
    ctx2d.restore();

    // Passenger count badge
    ctx2d.fillStyle = "#0a0a0b";
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.arc(cx + 12, cy - 8, 5, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.stroke();
    ctx2d.fillStyle = color;
    ctx2d.font = "7px monospace";
    ctx2d.textAlign = "center";
    ctx2d.fillText(`${passengers}`, cx + 12, cy - 5);
    ctx2d.textAlign = "left";
  },

  dispose(): void {
    _tickCount = 0;
    _ctx?.log("info", "TramVehicle disposed");
    _ctx = null;
  },
};

export const TramVehicleManifest: PackageManifest = {
  name: "@playliquid/vehicles/tram-executable",
  displayName: "Amsterdam Tram (Executable)",
  family: "vehicle",
  version: "1.0.0",
  specification: {
    name: "@playliquid/vehicles/tram-executable",
    displayName: "Amsterdam Tram",
    family: "vehicle",
    description: "An executable tram that moves along a route, boards passengers, and requests vehicle.drive + vehicle.board capabilities.",
    capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
    provides: [{ name: "avatar.movement", family: "avatar" }],
    requires: [{ name: "navigation.walkable", family: "navigation" }],
    spatial: { scale: "medium", anchorable: false, length: 18 },
  },
  capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
  provides: ["avatar.movement"],
  requires: ["navigation.walkable"],
  implementations: [
    {
      target: "playliquid-web",
      runtime: "playliquid",
      version: "1.0.0",
      entrypoint: "tram-vehicle.js",
      format: "js-module",
      capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
      contracts: ["avatar.movement"],
      assets: [],
      dependencies: [],
    },
    {
      target: "unity",
      runtime: "unity",
      version: "1.0.0",
      entrypoint: "TramVehicle.prefab",
      format: "unity-prefab",
      capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
      contracts: ["avatar.movement"],
      assets: ["TramVehicle.prefab"],
      dependencies: [],
    },
  ],
};
