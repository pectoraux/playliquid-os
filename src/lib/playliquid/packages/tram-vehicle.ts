// ════════════════════════════════════════════════════════════════
// TRAM VEHICLE — executable vehicle package (instance-isolated)
// ════════════════════════════════════════════════════════════════

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
} from "../package-abi";

class TramVehicleInstance implements PackageInstance {
  private ctx: KernelContext | null = null;
  private tickCount = 0;

  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    this.ctx = ctx;
    ctx.setState({
      routeProgress: 0, speed: 0.3, passengers: 3, maxPassengers: 20,
      color: "#7dd3fc", direction: 0,
    });
    ctx.log("info", `TramVehicle initialized on ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      const state = ctx.getState();
      const passengers = (state.passengers as number) ?? 0;
      const max = (state.maxPassengers as number) ?? 20;
      ctx.invokeCapability("vehicle.board").then((result) => {
        if (result.granted && passengers < max) {
          ctx.setState({ passengers: passengers + 1 });
          ctx.emit("vehicle.boarded", { entityId: ctx.entityId, passengers: passengers + 1 });
        } else if (!result.granted) {
          ctx.log("warn", `Boarding denied: ${result.action}`);
        }
      });
    });
  }

  mount(): void {
    this.ctx?.log("info", "TramVehicle mounted");
  }

  update(delta: number): void {
    if (!this.ctx) return;
    this.tickCount++;
    const state = this.ctx.getState();
    const progress = (state.routeProgress as number) ?? 0;
    const speed = (state.speed as number) ?? 0.3;
    const direction = (state.direction as number) ?? 0;
    this.ctx.setState({ routeProgress: (progress + speed * (delta / 16) * 0.01) % 1 });
    if (this.tickCount % 90 === 0) {
      this.ctx.requestMovement({
        x: Math.cos(direction + progress * Math.PI * 2) * speed,
        y: 0,
        z: Math.sin(direction + progress * Math.PI * 2) * speed,
      });
    }
  }

  handle(event: string): void {
    this.ctx?.log("info", `TramVehicle received: ${event}`);
  }

  render(rc: RenderContext): void {
    if (!this.ctx) return;
    const state = this.ctx.getState();
    const passengers = (state.passengers as number) ?? 0;
    const color = (state.color as string) ?? "#7dd3fc";
    const progress = (state.routeProgress as number) ?? 0;
    const w = 18, h = 8;
    const angle = progress * Math.PI * 2;

    rc.pushTransform(rc.screenX, rc.screenY, angle, 1);
    rc.drawRect(-w / 2, -h / 2, w, h, {
      fill: color,
      stroke: rc.selected ? "#ffffff" : "rgba(0,0,0,0.3)",
      strokeWidth: rc.selected ? 2 : 1,
    });
    // Windows
    for (let i = 0; i < 3; i++) {
      rc.drawRect(-w / 2 + 3 + i * 5, -h / 2 + 2, 3, h - 4, { fill: "rgba(255,255,255,0.4)" });
    }
    rc.popTransform();

    // Passenger badge
    rc.drawCircle(rc.screenX + 12, rc.screenY - 8, 5, { fill: "#0a0a0b", stroke: color, strokeWidth: 1 });
    rc.drawText(rc.screenX + 12, rc.screenY - 5, `${passengers}`, { color, size: 7, align: "center" });
  }

  dispose(): void {
    this.tickCount = 0;
    this.ctx?.log("info", "TramVehicle disposed");
    this.ctx = null;
  }
}

export const TramVehicleImplementation: PackageImplementation = {
  target: "playliquid-web",
  abiVersion: "1.0.0",
  capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
  createInstance: () => new TramVehicleInstance(),
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
    description: "Executable tram. Each entity gets its own instance.",
    capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
    provides: [{ name: "avatar.movement", family: "avatar" }],
    requires: [{ name: "navigation.walkable", family: "navigation" }],
    spatial: { scale: "medium", anchorable: false, length: 18 },
  },
  capabilities: ["vehicle.drive", "vehicle.board", "avatar.movement"],
  provides: ["avatar.movement"],
  requires: ["navigation.walkable"],
};
