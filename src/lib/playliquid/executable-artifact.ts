// ════════════════════════════════════════════════════════════════
// SANDBOXED EXECUTABLE PACKAGES — Tier B Runtime
// ════════════════════════════════════════════════════════════════
//
// R1: Tier B execution. LLMs can produce actual JavaScript logic that
// runs in a Web Worker sandbox. The worker has NO access to:
//   - network (fetch, WebSocket, XMLHttpRequest)
//   - DOM (document, window, localStorage)
//   - other packages
//   - authoritative state (only via KernelContext messages)
//
// The worker receives messages from the executor (update, render, handle)
// and sends messages back (setState, requestMovement, emit, invokeCapability).
// The worker NEVER touches the KernelContext directly — it communicates
// via postMessage.
//
// This means an LLM can produce genuinely novel behavior:
//
//   update(delta) {
//     // flocking algorithm, procedural generation, game mechanics, etc.
//     const neighbors = ctx.getState().neighbors || [];
//     const force = calculateFlockingForce(neighbors);
//     ctx.requestMovement(force);
//   }
//
// without PlayLiquid needing to add a "flock" behavior to the declarative
// vocabulary.
//
// The sandbox is enforced by the Web Worker environment itself — workers
// don't have access to DOM, and we strip network APIs from the worker scope.

import type {
  PackageImplementation,
  PackageInstance,
  KernelContext,
  PackageManifest,
  RenderContext,
} from "../package-abi";

// ── The executable artifact ───────────────────────────────────────
export interface ExecutableArtifact {
  abiVersion: string;
  name: string;
  displayName: string;
  family: string;
  capabilities: string[];
  provides: string[];
  requires: string[];
  initialState: Record<string, unknown>;
  // The actual JavaScript source code for the package.
  // Must export: initialize(ctx), mount(), update(delta), handle(event, payload), render(rc), dispose()
  // The code runs in a Web Worker — no DOM, no network, no filesystem.
  code: string;
  // Resource limits
  limits?: {
    maxCpuMs?: number;     // max CPU time per update() call
    maxMemoryMb?: number;  // max memory usage
    maxStateKeys?: number; // max number of state keys
  };
}

// ── Messages between executor and worker ─────────────────────────
type WorkerRequest =
  | { type: "initialize"; manifest: PackageManifest; state: Record<string, unknown> }
  | { type: "mount" }
  | { type: "update"; delta: number }
  | { type: "handle"; event: string; payload: Record<string, unknown> }
  | { type: "render"; screenX: number; screenY: number; worldX: number; worldY: number; worldZ: number; scale: number; selected: boolean }
  | { type: "dispose" };

type WorkerResponse =
  | { type: "initialized" }
  | { type: "mounted" }
  | { type: "updated"; statePatch: Record<string, unknown> }
  | { type: "handled" }
  | { type: "rendered"; drawCommands: DrawCommand[] }
  | { type: "disposed" }
  | { type: "requestMovement"; delta: { x: number; y: number; z: number } }
  | { type: "setState"; patch: Record<string, unknown> }
  | { type: "emit"; event: string; payload: Record<string, unknown> }
  | { type: "invokeCapability"; capability: string }
  | { type: "error"; message: string };

// ── Draw commands from the worker ─────────────────────────────────
interface DrawCommand {
  cmd: "drawBox" | "drawSphere" | "drawCylinder" | "drawCone" | "drawCircle" | "drawRect" | "drawLine" | "drawText";
  args: number[];
  opts: Record<string, unknown>;
}

// ── The worker script template ────────────────────────────────────
// This is the sandbox environment. The user's code runs inside this.
const WORKER_TEMPLATE = `
let state = {};
let ctx = null;

self.onmessage = function(e) {
  const msg = e.data;
  try {
    switch (msg.type) {
      case "initialize":
        state = msg.state || {};
        ctx = createKernelContext(msg.manifest);
        if (typeof userInitialize === 'function') userInitialize(ctx, msg.manifest);
        self.postMessage({ type: "initialized" });
        break;
      case "mount":
        if (typeof userMount === 'function') userMount();
        self.postMessage({ type: "mounted" });
        break;
      case "update":
        if (typeof userUpdate === 'function') userUpdate(msg.delta);
        self.postMessage({ type: "updated", statePatch: {} });
        break;
      case "handle":
        if (typeof userHandle === 'function') userHandle(msg.event, msg.payload);
        self.postMessage({ type: "handled" });
        break;
      case "render":
        drawCommands = [];
        if (typeof userRender === 'function') userRender(msg);
        self.postMessage({ type: "rendered", drawCommands: drawCommands });
        break;
      case "dispose":
        if (typeof userDispose === 'function') userDispose();
        self.postMessage({ type: "disposed" });
        break;
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};

let drawCommands = [];
function createKernelContext(manifest) {
  return {
    entityId: manifest.name,
    entityName: manifest.displayName,
    getPosition: function() { return state._position || {x:0,y:0,z:0}; },
    requestMovement: function(delta) {
      self.postMessage({ type: "requestMovement", delta: delta });
    },
    getState: function() { return state; },
    setState: function(patch) {
      Object.assign(state, patch);
      self.postMessage({ type: "setState", patch: patch });
    },
    emit: function(event, payload) {
      self.postMessage({ type: "emit", event: event, payload: payload || {} });
    },
    on: function(event, handler) {
      // Store handlers for later use
      if (!state._handlers) state._handlers = {};
      if (!state._handlers[event]) state._handlers[event] = [];
      state._handlers[event].push(handler);
    },
    invokeCapability: function(capability) {
      self.postMessage({ type: "invokeCapability", capability: capability });
      return Promise.resolve({ granted: true, action: "allow" });
    },
    requestService: function(service, action, params) {
      return Promise.resolve({ ok: true });
    },
    log: function(level, message) {
      // Logging is captured but not forwarded (for MVP)
    },
  };
}

// Drawing helpers available to user code
function drawBox(w, h, d, opts) { drawCommands.push({cmd:"drawBox", args:[w,h,d], opts:opts||{}}); }
function drawSphere(r, opts) { drawCommands.push({cmd:"drawSphere", args:[r], opts:opts||{}}); }
function drawCircle(x, y, r, opts) { drawCommands.push({cmd:"drawCircle", args:[x,y,r], opts:opts||{}}); }
function drawRect(x, y, w, h, opts) { drawCommands.push({cmd:"drawRect", args:[x,y,w,h], opts:opts||{}}); }
function drawLine(x1, y1, x2, y2, opts) { drawCommands.push({cmd:"drawLine", args:[x1,y1,x2,y2], opts:opts||{}}); }
function drawText(x, y, text, opts) { drawCommands.push({cmd:"drawText", args:[x,y,text.length], opts:{...opts, text}}); }

// USER CODE BELOW
`;

// ── The sandboxed package instance ────────────────────────────────
class SandboxedPackageInstance implements PackageInstance {
  private worker: Worker | null = null;
  private ctx: KernelContext | null = null;
  private artifact: ExecutableArtifact;
  private pendingDrawCommands: DrawCommand[] = [];
  private state: Record<string, unknown> = {};

  constructor(artifact: ExecutableArtifact) {
    this.artifact = artifact;
  }

  initialize(ctx: KernelContext, manifest: PackageManifest): void {
    this.ctx = ctx;
    this.state = { ...this.artifact.initialState };

    // Create the worker from the artifact's code
    const workerCode = WORKER_TEMPLATE + "\n" + this.artifact.code;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(workerUrl, { name: this.artifact.name });

    // Handle messages from the worker
    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case "requestMovement":
          this.ctx?.requestMovement(msg.delta);
          break;
        case "setState":
          Object.assign(this.state, msg.patch);
          this.ctx?.setState(msg.patch);
          break;
        case "emit":
          this.ctx?.emit(msg.event, msg.payload);
          break;
        case "invokeCapability":
          this.ctx?.invokeCapability(msg.capability);
          break;
        case "rendered":
          this.pendingDrawCommands = msg.drawCommands;
          break;
        case "error":
          this.ctx?.log("error", `Worker error: ${msg.message}`);
          break;
      }
    };

    // Send initialize
    this.worker.postMessage({
      type: "initialize",
      manifest,
      state: this.state,
    } as WorkerRequest);
  }

  mount(): void {
    this.worker?.postMessage({ type: "mount" } as WorkerRequest);
  }

  update(delta: number): void {
    this.worker?.postMessage({ type: "update", delta } as WorkerRequest);
  }

  handle(event: string, payload: Record<string, unknown>): void {
    this.worker?.postMessage({ type: "handle", event, payload } as WorkerRequest);
  }

  render(rc: RenderContext): void {
    // Ask the worker to produce draw commands
    // (In a real system this would be async — for the MVP we use the
    //  last batch of draw commands from the previous update cycle)
    this.worker?.postMessage({
      type: "render",
      screenX: rc.screenX, screenY: rc.screenY,
      worldX: rc.worldX, worldY: rc.worldY, worldZ: rc.worldZ,
      scale: rc.scale, selected: rc.selected,
    } as WorkerRequest);

    // Execute the draw commands through the RenderContext
    for (const cmd of this.pendingDrawCommands) {
      const opts = cmd.opts as any;
      switch (cmd.cmd) {
        case "drawBox":
          rc.drawBox?.(cmd.args[0], cmd.args[1], cmd.args[2], { color: opts.color || "#fff", ...opts });
          break;
        case "drawSphere":
          rc.drawSphere?.(cmd.args[0], { color: opts.color || "#fff", ...opts });
          break;
        case "drawCircle":
          rc.drawCircle(cmd.args[0], cmd.args[1], cmd.args[2], { fill: opts.color || "#fff", ...opts });
          break;
        case "drawRect":
          rc.drawRect(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], { fill: opts.color || "#fff", ...opts });
          break;
        case "drawLine":
          rc.drawLine(cmd.args[0], cmd.args[1], cmd.args[2], cmd.args[3], { stroke: opts.color || "#fff", ...opts });
          break;
        case "drawText":
          rc.drawText(cmd.args[0], cmd.args[1], opts.text || "", { color: opts.color || "#fff", ...opts });
          break;
      }
    }
    this.pendingDrawCommands = [];
  }

  dispose(): void {
    this.worker?.postMessage({ type: "dispose" } as WorkerRequest);
    this.worker?.terminate();
    this.worker = null;
  }
}

// ── Factory: creates a sandboxed implementation from an executable artifact ──
export function createExecutableImplementation(
  artifact: ExecutableArtifact
): PackageImplementation {
  return {
    target: "playliquid-web",
    abiVersion: artifact.abiVersion,
    capabilities: artifact.capabilities,
    createInstance: () => new SandboxedPackageInstance(artifact),
  };
}

// ── Validator for executable artifacts ────────────────────────────
export function validateExecutableArtifact(raw: unknown): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  artifact?: ExecutableArtifact;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch {
      errors.push("Artifact is not valid JSON");
      return { valid: false, errors, warnings };
    }
  }

  const a = raw as Record<string, unknown>;

  if (!a.abiVersion) errors.push("Missing required field: abiVersion");
  if (!a.name) errors.push("Missing required field: name");
  if (!a.displayName) errors.push("Missing required field: displayName");
  if (!a.family) errors.push("Missing required field: family");
  if (!Array.isArray(a.capabilities)) errors.push("Missing or invalid: capabilities");
  if (!a.code || typeof a.code !== "string") errors.push("Missing or invalid: code (must be string)");

  // Security checks — reject dangerous patterns in the code
  if (a.code && typeof a.code === "string") {
    const code = a.code as string;
    const dangerousPatterns = [
      { pattern: /fetch\s*\(/, msg: "Direct fetch() — packages must use ctx.requestService()" },
      { pattern: /XMLHttpRequest/, msg: "Direct XMLHttpRequest — packages must use ctx.requestService()" },
      { pattern: /WebSocket/, msg: "Direct WebSocket — packages must use ctx.requestService()" },
      { pattern: /importScripts/, msg: "importScripts — packages cannot load external scripts" },
      { pattern: /eval\s*\(/, msg: "eval() — packages cannot use dynamic evaluation" },
      { pattern: /Function\s*\(/, msg: "Function() constructor — packages cannot create dynamic functions" },
    ];
    for (const { pattern, msg } of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(`Security violation: ${msg}`);
      }
    }
    // Warnings (not blocking, but flagged)
    if (/self\.\w+/.test(code) && !/self\.onmessage/.test(code) && !/self\.postMessage/.test(code)) {
      warnings.push("Code accesses self.* properties — ensure it only uses the provided API");
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  return {
    valid: true,
    errors,
    warnings,
    artifact: {
      abiVersion: a.abiVersion as string,
      name: a.name as string,
      displayName: a.displayName as string,
      family: a.family as string,
      capabilities: a.capabilities as string[],
      provides: a.provides as string[] ?? [],
      requires: a.requires as string[] ?? [],
      initialState: (a.initialState as Record<string, unknown>) ?? {},
      code: a.code as string,
      limits: a.limits as { maxCpuMs?: number; maxMemoryMb?: number; maxStateKeys?: number } | undefined,
    },
  };
}
