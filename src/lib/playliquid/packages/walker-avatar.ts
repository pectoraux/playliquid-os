// ════════════════════════════════════════════════════════════════
// WALKER AVATAR — executable package (instance-isolated)
// ════════════════════════════════════════════════════════════════

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
} from "../package-abi";

class WalkerAvatarInstance implements PackageInstance {
  private ctx: KernelContext | null = null;
  private stepCounter = 0;

  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    this.ctx = ctx;
    ctx.setState({ direction: 0, speed: 0.5, steps: 0, color: "#a78bfa" });
    ctx.log("info", `WalkerAvatar initialized on ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      ctx.invokeCapability("jump").then((result) => {
        if (result.granted) {
          ctx.emit("avatar.jumped", { entityId: ctx.entityId });
          ctx.log("info", "Avatar jumped (capability granted)");
        } else {
          ctx.log("warn", `Avatar jump denied: ${result.action}`);
        }
      });
    });
  }

  mount(): void {
    this.ctx?.log("info", "WalkerAvatar mounted");
  }

  update(delta: number): void {
    if (!this.ctx) return;
    this.stepCounter++;
    if (this.stepCounter % 60 === 0) {
      const state = this.ctx.getState();
      const newDir = Math.random() * Math.PI * 2;
      this.ctx.setState({ direction: newDir, steps: ((state.steps as number) ?? 0) + 1 });
      this.ctx.requestMovement({
        x: Math.cos(newDir) * ((state.speed as number) ?? 0.5),
        y: 0,
        z: Math.sin(newDir) * ((state.speed as number) ?? 0.5),
      });
      this.ctx.emit("avatar.step", { entityId: this.ctx.entityId, direction: newDir });
    }
  }

  handle(event: string): void {
    this.ctx?.log("info", `WalkerAvatar received: ${event}`);
  }

  render(rc: RenderContext): void {
    if (!this.ctx) return;
    const state = this.ctx.getState();
    const direction = (state.direction as number) ?? 0;
    const color = (state.color as string) ?? "#a78bfa";
    const size = 8;

    rc.drawCircle(rc.screenX, rc.screenY, size, {
      fill: color,
      stroke: rc.selected ? "#ffffff" : color,
      strokeWidth: rc.selected ? 2 : 1,
    });
    rc.drawLine(
      rc.screenX, rc.screenY,
      rc.screenX + Math.cos(direction) * size * 1.5,
      rc.screenY + Math.sin(direction) * size * 1.5,
      { stroke: "rgba(255,255,255,0.6)", strokeWidth: 1.5 }
    );
  }

  dispose(): void {
    this.stepCounter = 0;
    this.ctx?.log("info", "WalkerAvatar disposed");
    this.ctx = null;
  }
}

export const WalkerAvatarImplementation: PackageImplementation = {
  target: "playliquid-web",
  abiVersion: "1.0.0",
  capabilities: ["walk", "jump", "avatar.movement"],
  createInstance: () => new WalkerAvatarInstance(),
};

export const WalkerAvatarManifest: PackageManifest = {
  name: "@playliquid/avatars/walker-executable",
  displayName: "Walker Avatar (Executable)",
  family: "avatar",
  version: "1.0.0",
  specification: {
    name: "@playliquid/avatars/walker-executable",
    displayName: "Walker Avatar",
    family: "avatar",
    description: "Executable avatar. Each entity gets its own instance with isolated state.",
    capabilities: ["walk", "jump", "avatar.movement"],
    provides: [{ name: "avatar.movement", family: "avatar" }],
    requires: [{ name: "navigation.walkable", family: "navigation" }],
    spatial: { scale: "small", anchorable: false, height: 1.8 },
  },
  capabilities: ["walk", "jump", "avatar.movement"],
  provides: ["avatar.movement"],
  requires: ["navigation.walkable"],
};
