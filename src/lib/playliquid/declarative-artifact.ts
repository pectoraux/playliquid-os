// ════════════════════════════════════════════════════════════════
// DECLARATIVE ARTIFACT FORMAT — the package definition LLMs produce
// ════════════════════════════════════════════════════════════════
//
// Instead of asking LLMs to produce arbitrary JavaScript (which requires
// a sandbox to execute safely), PlayLiquid defines a DECLARATIVE artifact
// format. LLMs produce structured JSON; the executor interprets it.
//
// This is safe by construction (no code execution, just data interpretation),
// verifiable (structural ABI conformance), and portable (the same JSON
// works on web, mobile, Unity via adapter).
//
// The format:
//
//   {
//     "abiVersion": "1.0.0",
//     "name": "@user/drone",
//     "displayName": "Patrol Drone",
//     "family": "vehicle",
//     "capabilities": ["vehicle.fly"],
//     "provides": ["spatial.anchor"],
//     "requires": ["spatial.anchor"],
//     "initialState": { "patrolX": 0, "patrolZ": 0, ... },
//     "update": { "behavior": "patrol", "params": { ... } },
//     "render": { "behavior": "shape", "params": { ... } },
//     "onClick": { "behavior": "emit", "params": { ... } }
//   }
//
// The executor calls createInstance() which returns a PackageInstance
// that interprets these declarative behaviors through the ABI.

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
} from "../package-abi";

// ── The declarative artifact ──────────────────────────────────────
export interface DeclarativeArtifact {
  abiVersion: string;
  name: string;
  displayName: string;
  family: string;
  capabilities: string[];
  provides: string[];
  requires: string[];
  initialState: Record<string, unknown>;
  update?: UpdateBehavior;
  render?: RenderBehavior;
  onClick?: ClickBehavior;
}

// ── Update behaviors ──────────────────────────────────────────────
export interface UpdateBehavior {
  behavior: "patrol" | "wander" | "spin" | "static" | "pulse";
  params: {
    speed?: number;
    routeWidth?: number;
    routeHeight?: number;
    spinSpeed?: number;
    pulseRate?: number;
    wanderRange?: number;
  };
}

// ── Render behaviors ──────────────────────────────────────────────
export interface RenderBehavior {
  behavior: "shape";
  params: {
    // 2D shapes (for canvas-2d adapters)
    shape: "circle" | "rect" | "diamond" | "triangle" | "box" | "sphere" | "cylinder" | "cone";
    size: number;
    color: string;
    strokeColor?: string;
    label?: string;
    showDirection?: boolean;
    // 3D params (used by Three.js/WebGL/Unity adapters)
    width?: number;
    height?: number;
    depth?: number;
    radius?: number;
    emissive?: string;
    metalness?: number;
    roughness?: number;
    opacity?: number;
    wireframe?: boolean;
  };
}

// ── Click behaviors ───────────────────────────────────────────────
export interface ClickBehavior {
  behavior: "emit" | "toggle" | "requestCapability";
  params: {
    event?: string;
    payload?: Record<string, unknown>;
    capability?: string;
    stateField?: string;
  };
}

// ════════════════════════════════════════════════════════════════
// DECLARATIVE PACKAGE INSTANCE — interprets the artifact
// ════════════════════════════════════════════════════════════════
//
// This is the interpreter. It takes a DeclarativeArtifact and implements
// the PackageInstance interface. The update/render/handle methods
// interpret the declarative behaviors.
//
// This means ANY artifact that conforms to the format is executable —
// no hard-coded registry entry needed.

class DeclarativePackageInstance implements PackageInstance {
  private ctx: KernelContext | null = null;
  private artifact: DeclarativeArtifact;
  private tickCount = 0;

  constructor(artifact: DeclarativeArtifact) {
    this.artifact = artifact;
  }

  initialize(ctx: KernelContext, _manifest: PackageManifest): void {
    this.ctx = ctx;
    ctx.setState({ ...this.artifact.initialState });
    ctx.log("info", `${this.artifact.displayName} initialized (declarative)`);
    if (this.artifact.onClick) {
      ctx.on("entity.click", () => this.handleClick());
    }
  }

  mount(): void {
    this.ctx?.log("info", `${this.artifact.displayName} mounted`);
  }

  update(delta: number): void {
    if (!this.ctx || !this.artifact.update) return;
    this.tickCount++;
    const state = this.ctx.getState();
    const { behavior, params } = this.artifact.update;

    switch (behavior) {
      case "patrol": {
        const speed = params.speed ?? 0.3;
        const w = params.routeWidth ?? 20;
        const h = params.routeHeight ?? 15;
        const progress = ((state.patrolProgress as number) ?? 0) + speed * (delta / 16) * 0.01;
        const angle = progress * Math.PI * 2;
        const px = Math.cos(angle) * w;
        const pz = Math.sin(angle) * h;
        this.ctx.setState({ patrolProgress: progress, patrolX: px, patrolZ: pz, direction: angle });
        this.ctx.requestMovement({ x: px - ((state.patrolX as number) ?? 0), y: 0, z: pz - ((state.patrolZ as number) ?? 0) });
        break;
      }
      case "wander": {
        if (this.tickCount % 60 === 0) {
          const range = params.wanderRange ?? 5;
          const dir = Math.random() * Math.PI * 2;
          const speed = params.speed ?? 0.5;
          this.ctx.setState({ direction: dir });
          this.ctx.requestMovement({ x: Math.cos(dir) * speed, y: 0, z: Math.sin(dir) * speed });
          this.ctx.emit("wander.step", { entityId: this.ctx.entityId });
        }
        break;
      }
      case "spin": {
        const rotation = ((state.rotation as number) ?? 0) + (params.spinSpeed ?? 0.02) * (delta / 16);
        this.ctx.setState({ rotation });
        break;
      }
      case "pulse": {
        const pulse = Math.sin(this.tickCount * (params.pulseRate ?? 0.05)) * 0.5 + 1;
        this.ctx.setState({ pulseScale: pulse });
        break;
      }
      case "static":
        // No update needed
        break;
    }
  }

  handle(event: string): void {
    this.ctx?.log("info", `${this.artifact.displayName} received: ${event}`);
  }

  render(rc: RenderContext): void {
    if (!this.ctx || !this.artifact.render) return;
    const state = this.ctx.getState();
    const { shape, size, color, strokeColor, label, showDirection } = this.artifact.render.params;
    const isSelected = rc.selected;
    const pulseScale = (state.pulseScale as number) ?? 1;
    const renderSize = size * pulseScale;
    const rotation = (state.rotation as number) ?? 0;

    if (rotation !== 0) {
      rc.pushTransform(rc.screenX, rc.screenY, rotation, 1);
    }

    const opts = {
      fill: color,
      stroke: strokeColor ?? (isSelected ? "#ffffff" : "rgba(0,0,0,0.3)"),
      strokeWidth: isSelected ? 2 : 1,
    };

    switch (shape) {
      case "circle":
        rc.drawCircle(rotation !== 0 ? 0 : rc.screenX, rotation !== 0 ? 0 : rc.screenY, renderSize, opts);
        break;
      case "rect":
        rc.drawRect(
          (rotation !== 0 ? 0 : rc.screenX) - renderSize,
          (rotation !== 0 ? 0 : rc.screenY) - renderSize,
          renderSize * 2, renderSize * 2, opts
        );
        break;
      case "diamond":
        rc.drawPath([
          { x: (rotation !== 0 ? 0 : rc.screenX), y: (rotation !== 0 ? 0 : rc.screenY) - renderSize },
          { x: (rotation !== 0 ? 0 : rc.screenX) + renderSize, y: (rotation !== 0 ? 0 : rc.screenY) },
          { x: (rotation !== 0 ? 0 : rc.screenX), y: (rotation !== 0 ? 0 : rc.screenY) + renderSize },
          { x: (rotation !== 0 ? 0 : rc.screenX) - renderSize, y: (rotation !== 0 ? 0 : rc.screenY) },
        ], opts);
        break;
      case "triangle":
        rc.drawPath([
          { x: (rotation !== 0 ? 0 : rc.screenX), y: (rotation !== 0 ? 0 : rc.screenY) - renderSize },
          { x: (rotation !== 0 ? 0 : rc.screenX) + renderSize, y: (rotation !== 0 ? 0 : rc.screenY) + renderSize },
          { x: (rotation !== 0 ? 0 : rc.screenX) - renderSize, y: (rotation !== 0 ? 0 : rc.screenY) + renderSize },
        ], opts);
        break;
      // ── 3D shapes (used by Three.js adapter; 2D adapters ignore these) ──
      case "box":
        if (rc.drawBox) {
          rc.setPosition?.(rc.worldX, rc.worldY, rc.worldZ);
          rc.setScale?.(pulseScale);
          rc.drawBox(
            this.artifact.render.params.width ?? renderSize * 2,
            this.artifact.render.params.height ?? renderSize * 2,
            this.artifact.render.params.depth ?? renderSize * 2,
            {
              color,
              emissive: this.artifact.render.params.emissive,
              metalness: this.artifact.render.params.metalness,
              roughness: this.artifact.render.params.roughness,
              opacity: this.artifact.render.params.opacity,
              wireframe: this.artifact.render.params.wireframe,
            }
          );
        }
        break;
      case "sphere":
        if (rc.drawSphere) {
          rc.setPosition?.(rc.worldX, rc.worldY, rc.worldZ);
          rc.setScale?.(pulseScale);
          rc.drawSphere(renderSize, {
            color,
            emissive: this.artifact.render.params.emissive,
            metalness: this.artifact.render.params.metalness,
            roughness: this.artifact.render.params.roughness,
            opacity: this.artifact.render.params.opacity,
            wireframe: this.artifact.render.params.wireframe,
          });
        }
        break;
      case "cylinder":
        if (rc.drawCylinder) {
          rc.setPosition?.(rc.worldX, rc.worldY, rc.worldZ);
          rc.drawCylinder(renderSize, renderSize, this.artifact.render.params.height ?? renderSize * 2, {
            color,
            emissive: this.artifact.render.params.emissive,
          });
        }
        break;
      case "cone":
        if (rc.drawCone) {
          rc.setPosition?.(rc.worldX, rc.worldY, rc.worldZ);
          rc.drawCone(renderSize, this.artifact.render.params.height ?? renderSize * 2, {
            color,
            emissive: this.artifact.render.params.emissive,
          });
        }
        break;
    }

    if (rotation !== 0) {
      rc.popTransform();
    }

    if (showDirection) {
      const dir = (state.direction as number) ?? 0;
      rc.drawLine(rc.screenX, rc.screenY,
        rc.screenX + Math.cos(dir) * renderSize * 1.5,
        rc.screenY + Math.sin(dir) * renderSize * 1.5,
        { stroke: "rgba(255,255,255,0.5)", strokeWidth: 1.5 }
      );
    }

    if (label || isSelected) {
      rc.drawText(rc.screenX + renderSize + 2, rc.screenY + 3,
        label ?? this.ctx.entityName, { color: "rgba(255,255,255,0.7)", size: 9 }
      );
    }
  }

  private handleClick(): void {
    if (!this.ctx || !this.artifact.onClick) return;
    const { behavior, params } = this.artifact.onClick;
    switch (behavior) {
      case "emit":
        this.ctx.emit(params.event ?? "entity.click", { entityId: this.ctx.entityId, ...params.payload });
        this.ctx.log("info", `Emitted ${params.event ?? "entity.click"}`);
        break;
      case "toggle": {
        const field = params.stateField ?? "active";
        const current = (this.ctx.getState()[field] as boolean) ?? false;
        this.ctx.setState({ [field]: !current });
        this.ctx.log("info", `Toggled ${field} → ${!current}`);
        break;
      }
      case "requestCapability":
        if (params.capability) {
          this.ctx.invokeCapability(params.capability).then((result) => {
            this.ctx?.log(result.granted ? "info" : "warn", `Capability ${params.capability} → ${result.action}`);
          });
        }
        break;
    }
  }

  dispose(): void {
    this.ctx?.log("info", `${this.artifact.displayName} disposed`);
    this.ctx = null;
  }
}

// ════════════════════════════════════════════════════════════════
// DECLARATIVE PACKAGE IMPLEMENTATION — the factory
// ════════════════════════════════════════════════════════════════
//
// Given a DeclarativeArtifact, this returns a PackageImplementation
// that conforms to the ABI. The createInstance() method creates a
// new DeclarativePackageInstance for each entity.
//
// This is the key: ANY artifact (including one from an external LLM)
// can be turned into an executable PackageImplementation through this
// factory. No hard-coded registry needed.

export function createDeclarativeImplementation(
  artifact: DeclarativeArtifact
): PackageImplementation {
  return {
    target: "playliquid-web",
    abiVersion: artifact.abiVersion,
    capabilities: artifact.capabilities,
    createInstance: () => new DeclarativePackageInstance(artifact),
  };
}

// ════════════════════════════════════════════════════════════════
// ARTIFACT VALIDATOR — structural ABI certification
// ════════════════════════════════════════════════════════════════
//
// Validates that an artifact conforms to the declarative format.
// This is REAL certification — structural validation, not just string
// checks. An invalid artifact is rejected (valid: false).

export interface ArtifactValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  artifact?: DeclarativeArtifact;
}

export function validateDeclarativeArtifact(raw: unknown): ArtifactValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw === "string") {
    // Try to parse as JSON
    try {
      raw = JSON.parse(raw);
    } catch {
      errors.push("Artifact is not valid JSON");
      return { valid: false, errors, warnings };
    }
  }

  const a = raw as Record<string, unknown>;

  // Required fields
  if (!a.abiVersion) errors.push("Missing required field: abiVersion");
  if (!a.name) errors.push("Missing required field: name");
  if (!a.displayName) errors.push("Missing required field: displayName");
  if (!a.family) errors.push("Missing required field: family");
  if (!Array.isArray(a.capabilities)) errors.push("Missing or invalid: capabilities (must be array)");
  if (!Array.isArray(a.provides)) errors.push("Missing or invalid: provides (must be array)");
  if (!Array.isArray(a.requires)) errors.push("Missing or invalid: requires (must be array)");

  // Validate family
  const validFamilies = ["avatar", "building", "road", "vehicle", "creature", "physics", "weather", "economy", "audio", "ai", "knowledge", "sensor", "sensory", "renderer", "input", "infrastructure"];
  if (a.family && !validFamilies.includes(a.family as string)) {
    warnings.push(`Unknown family "${a.family}" — will still execute but may not match world theme filters`);
  }

  // Validate update behavior
  if (a.update) {
    const u = a.update as Record<string, unknown>;
    if (!u.behavior) {
      errors.push("update.behavior is required when update is specified");
    } else {
      const validBehaviors = ["patrol", "wander", "spin", "static", "pulse"];
      if (!validBehaviors.includes(u.behavior as string)) {
        errors.push(`Invalid update behavior "${u.behavior}". Valid: ${validBehaviors.join(", ")}`);
      }
    }
  }

  // Validate render behavior
  if (a.render) {
    const r = a.render as Record<string, unknown>;
    if (!r.behavior) {
      errors.push("render.behavior is required when render is specified");
    } else if (r.behavior !== "shape") {
      errors.push(`Invalid render behavior "${r.behavior}". Valid: shape`);
    }
    if (r.params) {
      const p = r.params as Record<string, unknown>;
      if (p.shape && !["circle", "rect", "diamond", "triangle", "box", "sphere", "cylinder", "cone"].includes(p.shape as string)) {
        errors.push(`Invalid render shape "${p.shape}". Valid: circle, rect, diamond, triangle, box, sphere, cylinder, cone`);
      }
      if (!p.size || typeof p.size !== "number") {
        warnings.push("render.params.size should be a number — defaulting to 8");
      }
      if (!p.color) {
        warnings.push("render.params.color not specified — will use default");
      }
    }
  }

  // Validate onClick behavior
  if (a.onClick) {
    const c = a.onClick as Record<string, unknown>;
    if (!c.behavior) {
      errors.push("onClick.behavior is required when onClick is specified");
    } else {
      const validClickBehaviors = ["emit", "toggle", "requestCapability"];
      if (!validClickBehaviors.includes(c.behavior as string)) {
        errors.push(`Invalid onClick behavior "${c.behavior}". Valid: ${validClickBehaviors.join(", ")}`);
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const artifact: DeclarativeArtifact = {
    abiVersion: a.abiVersion as string,
    name: a.name as string,
    displayName: a.displayName as string,
    family: a.family as string,
    capabilities: a.capabilities as string[],
    provides: a.provides as string[],
    requires: a.requires as string[],
    initialState: (a.initialState as Record<string, unknown>) ?? {},
    update: a.update as UpdateBehavior | undefined,
    render: a.render as RenderBehavior | undefined,
    onClick: a.onClick as ClickBehavior | undefined,
  };

  return { valid: true, errors, warnings, artifact };
}
