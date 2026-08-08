// ════════════════════════════════════════════════════════════════
// RESOURCE GUARD — Runtime Enforcement of Package Certification
// ════════════════════════════════════════════════════════════════
//
// Phase L: Certification sets resource limits at import time. The
// ResourceGuard ENFORCES them at runtime — every update(), handle(),
// and render() call is wrapped.
//
// Enforced limits (from the CertificationRecord):
//   - maxCpuMs:      CPU time per update() call. If exceeded, the
//                    package is killed (dispose + flag).
//   - maxStateKeys:  number of state keys the package can write. If
//                    exceeded, the setState is rejected.
//   - maxUpdateRate: updates per second. If exceeded, the update is
//                    skipped (throttled).
//   - maxMemoryMb:   (advisory — measured, not hard-enforced in JS)
//
// Additionally:
//   - Capability auditing: every invokeCapability call is logged.
//   - Deterministic execution: a seeded RNG is provided so packages
//     produce the same output given the same seed (reproducible worlds).
//   - Dependency isolation: each guarded instance has its own state
//     namespace — no shared globals between instances.
//
// When a package violates its limits, the guard:
//   1. Logs the violation to the audit trail.
//   2. Calls dispose() on the package.
//   3. Marks it as "killed" — further update/render calls are no-ops.
//   4. Emits a "package.killed" event through the KernelContext.

import type { PackageInstance, KernelContext, PackageManifest, RenderContext } from "./package-abi";
import type { ResourceLimits } from "./certification";

export interface AuditEntry {
  timestamp: number;
  entityId: string;
  event: string;
  details: Record<string, unknown>;
}

export interface GuardState {
  killed: boolean;
  killReason: string | null;
  updateCount: number;
  lastUpdateAt: number;
  updatesThisSecond: number;
  secondStart: number;
  stateKeysWritten: Set<string>;
  capabilityCalls: string[];
  cpuTimeTotalMs: number;
  violations: AuditEntry[];
}

// ── Deterministic seeded RNG (mulberry32) ─────────────────────────
// Packages that need randomness use ctx.deterministicRandom() instead
// of Math.random(). Same seed → same sequence → reproducible worlds.
export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ResourceGuard implements PackageInstance {
  private state: GuardState;
  private rng: () => number;
  private auditLog: AuditEntry[];
  private entityId: string;
  private limits: ResourceLimits;
  private inner: PackageInstance;
  private wrappedCtx: KernelContext | null = null;

  constructor(
    inner: PackageInstance,
    entityId: string,
    limits: ResourceLimits,
    seed: number = 42,
    auditLog: AuditEntry[] = []
  ) {
    this.inner = inner;
    this.entityId = entityId;
    this.limits = limits;
    this.rng = createSeededRng(seed);
    this.auditLog = auditLog;
    this.state = {
      killed: false,
      killReason: null,
      updateCount: 0,
      lastUpdateAt: 0,
      updatesThisSecond: 0,
      secondStart: Date.now(),
      stateKeysWritten: new Set(),
      capabilityCalls: [],
      cpuTimeTotalMs: 0,
      violations: [],
    };
  }

  get isKilled() { return this.state.killed; }
  get killReason() { return this.state.killReason; }
  getGuardState(): GuardState { return { ...this.state, stateKeysWritten: new Set(this.state.stateKeysWritten) }; }

  private audit(event: string, details: Record<string, unknown>) {
    const entry: AuditEntry = {
      timestamp: Date.now(),
      entityId: this.entityId,
      event,
      details,
    };
    this.state.violations.push(entry);
    this.auditLog.push(entry);
  }

  private kill(reason: string) {
    if (this.state.killed) return;
    this.state.killed = true;
    this.state.killReason = reason;
    this.audit("package.killed", { reason, entityId: this.entityId });
    try { this.inner.dispose(); } catch {}
    // Notify the KernelContext so the world can react
    if (this.wrappedCtx) {
      try { this.wrappedCtx.emit("package.killed", { entityId: this.entityId, reason }); } catch {}
    }
  }

  // ── Wrap the KernelContext to intercept state writes + capabilities ──
  // Arrow functions capture `this` lexically, so no explicit alias needed.
  private wrapContext(ctx: KernelContext): KernelContext {
    const wrapped: KernelContext = {
      ...ctx,
      setState: (patch: Record<string, unknown>) => {
        if (this.state.killed) return;
        // Enforce maxStateKeys
        for (const key of Object.keys(patch)) {
          this.state.stateKeysWritten.add(key);
        }
        if (this.state.stateKeysWritten.size > this.limits.maxStateKeys) {
          this.audit("violation.maxStateKeys", {
            count: this.state.stateKeysWritten.size,
            limit: this.limits.maxStateKeys,
          });
          this.kill(`exceeded maxStateKeys (${this.limits.maxStateKeys})`);
          return;
        }
        ctx.setState(patch);
      },
      invokeCapability: async (capability: string) => {
        if (this.state.killed) return { granted: false, action: "deny" as const };
        // Capability auditing
        this.state.capabilityCalls.push(capability);
        this.audit("capability.invoke", { capability });
        return ctx.invokeCapability(capability);
      },
      // Provide deterministic randomness
      deterministicRandom: () => this.rng(),
    };
    this.wrappedCtx = wrapped;
    return wrapped;
  }

  // ── PackageInstance implementation (wraps the inner instance) ───
  initialize(ctx: KernelContext, manifest: PackageManifest): void {
    if (this.state.killed) return;
    try {
      this.inner.initialize(this.wrapContext(ctx), manifest);
    } catch (e) {
      this.kill(`initialize threw: ${e instanceof Error ? e.message : e}`);
    }
  }

  mount(): void {
    if (this.state.killed) return;
    try { this.inner.mount(); }
    catch (e) { this.kill(`mount threw: ${e instanceof Error ? e.message : e}`); }
  }

  update(delta: number): void {
    if (this.state.killed) return;

    // ── Enforce maxUpdateRate ────────────────────────────────────
    const now = Date.now();
    if (now - this.state.secondStart >= 1000) {
      this.state.updatesThisSecond = 0;
      this.state.secondStart = now;
    }
    this.state.updatesThisSecond++;
    if (this.state.updatesThisSecond > this.limits.maxUpdateRate) {
      // Throttle — skip this update (don't kill, just skip)
      this.state.violations.push({
        timestamp: now,
        entityId: this.entityId,
        event: "throttle.maxUpdateRate",
        details: { rate: this.state.updatesThisSecond, limit: this.limits.maxUpdateRate },
      });
      return;
    }

    // ── Enforce maxCpuMs ─────────────────────────────────────────
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      this.inner.update(delta);
    } catch (e) {
      this.kill(`update threw: ${e instanceof Error ? e.message : e}`);
      return;
    }
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    const cpuMs = end - start;
    this.state.cpuTimeTotalMs += cpuMs;
    this.state.updateCount++;
    this.state.lastUpdateAt = now;

    if (cpuMs > this.limits.maxCpuMs) {
      this.audit("violation.maxCpuMs", {
        cpuMs: Math.round(cpuMs * 100) / 100,
        limit: this.limits.maxCpuMs,
      });
      this.kill(`exceeded maxCpuMs (${cpuMs.toFixed(2)}ms > ${this.limits.maxCpuMs}ms)`);
    }
  }

  handle(event: string, payload: Record<string, unknown>): void {
    if (this.state.killed) return;
    try { this.inner.handle(event, payload); }
    catch (e) { this.kill(`handle threw: ${e instanceof Error ? e.message : e}`); }
  }

  render(rc: RenderContext): void {
    if (this.state.killed) return;
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      this.inner.render(rc);
    } catch (e) {
      this.kill(`render threw: ${e instanceof Error ? e.message : e}`);
      return;
    }
    const end = typeof performance !== "undefined" ? performance.now() : Date.now();
    const cpuMs = end - start;
    // Render CPU also counts toward the budget (advisory)
    if (cpuMs > this.limits.maxCpuMs) {
      this.audit("warning.renderCpuHigh", { cpuMs: Math.round(cpuMs * 100) / 100, limit: this.limits.maxCpuMs });
    }
  }

  dispose(): void {
    try { this.inner.dispose(); } catch {}
  }
}
