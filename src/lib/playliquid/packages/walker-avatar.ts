// ════════════════════════════════════════════════════════════════
// WALKER AVATAR — executable package
// ════════════════════════════════════════════════════════════════
//
// A real avatar package. It:
//   - wanders randomly using requestMovement (Kernel may deny)
//   - emits "avatar.step" events
//   - requests the "walk" capability through the Kernel gate
//   - renders as a circle with a direction indicator
//   - all state through KernelContext — no globals

import type { PackageRuntimeABI, KernelContext, PackageManifest, RenderContext } from "../package-abi";

let _ctx: KernelContext | null = null;
let _stepCounter = 0;

export const WalkerAvatarPackage: PackageRuntimeABI = {
  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    _ctx = ctx;
    ctx.setState({ direction: 0, speed: 0.5, steps: 0, color: "#a78bfa" });
    ctx.log("info", `WalkerAvatar initialized on ${ctx.entityName}`);
    ctx.on("entity.click", () => {
      // Clicking the avatar requests the "jump" capability
      ctx.invokeCapability("jump").then((result) => {
        if (result.granted) {
          ctx.emit("avatar.jumped", { entityId: ctx.entityId });
          ctx.log("info", "Avatar jumped (capability granted)");
        } else {
          ctx.log("warn", `Avatar jump denied: ${result.action}`);
        }
      });
    });
  },

  mount(): void {
    _ctx?.log("info", "WalkerAvatar mounted");
  },

  update(delta: number): void {
    if (!_ctx) return;
    const state = _ctx.getState();
    const direction = (state.direction as number) ?? 0;
    const speed = (state.speed as number) ?? 0.5;

    // Every ~60 ticks, change direction
    _stepCounter++;
    if (_stepCounter % 60 === 0) {
      const newDir = Math.random() * Math.PI * 2;
      _ctx.setState({ direction: newDir });
      // Request movement through the Kernel — it may deny based on policy
      const dx = Math.cos(newDir) * speed;
      const dz = Math.sin(newDir) * speed;
      _ctx.requestMovement({ x: dx, y: 0, z: dz });
      _ctx.emit("avatar.step", { entityId: _ctx.entityId, direction: newDir });
      _ctx.setState({ steps: ((state.steps as number) ?? 0) + 1 });
    }
  },

  handle(event: string, _payload: Record<string, unknown>): void {
    if (!_ctx) return;
    if (event === "avatar.jumped") {
      _ctx.log("info", "WalkerAvatar observed a jump event");
    }
  },

  render(rc: RenderContext): void {
    if (rc.type !== "canvas-2d" || !rc.ctx2d || !_ctx) return;
    const ctx2d = rc.ctx2d;
    const state = _ctx.getState();
    const direction = (state.direction as number) ?? 0;
    const color = (state.color as string) ?? "#a78bfa";

    const size = 8;
    const cx = rc.screenX;
    const cy = rc.screenY;

    // Draw avatar as a circle
    ctx2d.fillStyle = color;
    ctx2d.strokeStyle = rc.selected ? "#ffffff" : color;
    ctx2d.lineWidth = rc.selected ? 2 : 1;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, size, 0, Math.PI * 2);
    ctx2d.fill();
    if (rc.selected) ctx2d.stroke();

    // Direction indicator
    ctx2d.strokeStyle = "rgba(255,255,255,0.6)";
    ctx2d.lineWidth = 1.5;
    ctx2d.beginPath();
    ctx2d.moveTo(cx, cy);
    ctx2d.lineTo(cx + Math.cos(direction) * size * 1.5, cy + Math.sin(direction) * size * 1.5);
    ctx2d.stroke();
  },

  dispose(): void {
    _stepCounter = 0;
    _ctx?.log("info", "WalkerAvatar disposed");
    _ctx = null;
  },
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
    description: "An executable avatar that wanders, emits step events, and requests the jump capability through the Kernel gate.",
    capabilities: ["walk", "jump", "avatar.movement"],
    provides: [{ name: "avatar.movement", family: "avatar" }],
    requires: [{ name: "navigation.walkable", family: "navigation" }],
    spatial: { scale: "small", anchorable: false, height: 1.8 },
  },
  capabilities: ["walk", "jump", "avatar.movement"],
  provides: ["avatar.movement"],
  requires: ["navigation.walkable"],
  implementations: [
    {
      target: "playliquid-web",
      runtime: "playliquid",
      version: "1.0.0",
      entrypoint: "walker-avatar.js",
      format: "js-module",
      capabilities: ["walk", "jump", "avatar.movement"],
      contracts: ["avatar.movement"],
      assets: [],
      dependencies: [],
    },
    {
      target: "unity",
      runtime: "unity",
      version: "1.0.0",
      entrypoint: "WalkerAvatar.prefab",
      format: "unity-prefab",
      capabilities: ["walk", "jump", "avatar.movement"],
      contracts: ["avatar.movement"],
      assets: ["WalkerAvatar.prefab"],
      dependencies: [],
    },
  ],
};
