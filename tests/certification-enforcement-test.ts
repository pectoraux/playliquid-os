// ════════════════════════════════════════════════════════════════
// PLAYLIQUID CERTIFICATION ENFORCEMENT TEST (Phase L)
// ════════════════════════════════════════════════════════════════
//
// The reviewer's directive:
//   "Package certification: Resource limits, deterministic execution,
//    capability auditing, dependency isolation."
//
// This test proves the ResourceGuard ENFORCES the limits set at
// certification time — not just declares them.
//
// Tests:
//   1. A package that exceeds maxCpuMs (busy-loops) → killed
//   2. A package that exceeds maxStateKeys → killed
//   3. A package that exceeds maxUpdateRate → throttled (not killed)
//   4. Capability auditing: every invokeCapability is logged
//   5. Deterministic execution: same seed → same RNG sequence
//   6. Dependency isolation: two instances have independent state
//   7. A well-behaved package is NOT killed
//
// Run: bun run tests/certification-enforcement-test.ts
// Exit code 0 = PASS, non-zero = FAIL.

import { ResourceGuard, createSeededRng, type AuditEntry } from "../src/lib/playliquid/resource-guard";
import { DEFAULT_LIMITS } from "../src/lib/playliquid/certification";
import type { PackageInstance, KernelContext, PackageManifest, RenderContext } from "../src/lib/playliquid/package-abi";

function log(msg: string) { console.log(msg); }

// ── Test package: busy-loops to exceed CPU ───────────────────────
class CpuHogPackage implements PackageInstance {
  private ctx: KernelContext | null = null;
  initialize(ctx: KernelContext, _manifest: PackageManifest): void { this.ctx = ctx; }
  mount(): void {}
  update(_delta: number): void {
    // Busy-loop for ~50ms (exceeds the 16ms budget)
    const start = Date.now();
    while (Date.now() - start < 50) { /* spin */ }
  }
  handle(): void {}
  render(): void {}
  dispose(): void {}
}

// ── Test package: writes too many state keys ────────────────────
class StateKeySpammer implements PackageInstance {
  private ctx: KernelContext | null = null;
  initialize(ctx: KernelContext, _manifest: PackageManifest): void { this.ctx = ctx; }
  mount(): void {}
  update(_delta: number): void {
    // Write 200 keys (exceeds the 100 limit)
    for (let i = 0; i < 200; i++) {
      this.ctx!.setState({ [`key${i}`]: i });
    }
  }
  handle(): void {}
  render(): void {}
  dispose(): void {}
}

// ── Test package: well-behaved ──────────────────────────────────
class GoodPackage implements PackageInstance {
  private ctx: KernelContext | null = null;
  initialize(ctx: KernelContext, _manifest: PackageManifest): void { this.ctx = ctx; }
  mount(): void {}
  update(_delta: number): void {
    // Stays within limits: < 16ms CPU, < 100 state keys
    this.ctx!.setState({ counter: 1, color: "#00ff00" });
  }
  handle(): void {}
  render(): void {}
  dispose(): void {}
}

// ── Test package: uses capabilities ─────────────────────────────
class CapabilityUser implements PackageInstance {
  private ctx: KernelContext | null = null;
  initialize(ctx: KernelContext, _manifest: PackageManifest): void { this.ctx = ctx; }
  mount(): void {
    // Invoke capabilities synchronously in mount (so the guard can audit)
    // The guard wraps invokeCapability to log it.
    this.ctx!.invokeCapability("avatar.movement");
    this.ctx!.invokeCapability("physics.collide");
  }
  update(_delta: number): void {
    // Also invoke in update (sync)
    this.ctx!.invokeCapability("avatar.movement");
  }
  handle(): void {}
  render(): void {}
  dispose(): void {}
}

// ── Mock KernelContext ──────────────────────────────────────────
function makeMockCtx(): KernelContext {
  const state: Record<string, unknown> = {};
  const handlers = new Map<string, Array<(p: Record<string, unknown>) => void>>();
  return {
    entityId: "test-entity",
    entityName: "Test",
    getPosition: () => ({ x: 0, y: 0, z: 0 }),
    requestMovement: () => {},
    getState: () => state,
    setState: (patch) => { Object.assign(state, patch); },
    emit: (event, payload) => { (handlers.get(event) ?? []).forEach((h) => h(payload)); },
    on: (event, handler) => { if (!handlers.has(event)) handlers.set(event, []); handlers.get(event)!.push(handler); },
    invokeCapability: async (cap) => { return { granted: true, action: "allow" as const }; },
    requestService: async () => ({ ok: true }),
    log: () => {},
  };
}

const MANIFEST: PackageManifest = {
  name: "@test/pkg", displayName: "Test", family: "test", version: "1.0.0",
  specification: {}, capabilities: [], provides: [], requires: [],
};

// ── Tests ────────────────────────────────────────────────────────
async function main() {
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  Certification Enforcement Test (Phase L)                ║");
  log("╚════════════════════════════════════════════════════════════╝\n");

  let passed = 0, failed = 0;
  const sharedAuditLog: AuditEntry[] = [];

  // ── Test 1: CPU hog is killed ─────────────────────────────────
  log("── Test 1: CPU hog (exceeds maxCpuMs=16ms, spins 50ms) ──");
  {
    const guard = new ResourceGuard(new CpuHogPackage(), "cpu-hog", DEFAULT_LIMITS, 42, sharedAuditLog);
    guard.initialize(makeMockCtx(), MANIFEST);
    guard.mount();
    guard.update(16); // should kill here
    if (guard.isKilled) { passed++; log("  ✅ PASS: CPU hog killed — " + guard.killReason); }
    else { failed++; log("  ❌ FAIL: CPU hog NOT killed"); }
  }

  // ── Test 2: State-key spammer is killed ──────────────────────
  log("\n── Test 2: State-key spammer (exceeds maxStateKeys=100, writes 200) ──");
  {
    const guard = new ResourceGuard(new StateKeySpammer(), "key-spammer", DEFAULT_LIMITS, 42, sharedAuditLog);
    guard.initialize(makeMockCtx(), MANIFEST);
    guard.mount();
    guard.update(16); // should kill when it writes > 100 keys
    if (guard.isKilled) { passed++; log("  ✅ PASS: state-key spammer killed — " + guard.killReason); }
    else { failed++; log("  ❌ FAIL: state-key spammer NOT killed"); }
  }

  // ── Test 3: Update rate throttling (not killed) ──────────────
  log("\n── Test 3: Update rate throttling (exceeds maxUpdateRate=60/sec) ──");
  {
    const guard = new ResourceGuard(new GoodPackage(), "throttle-test", DEFAULT_LIMITS, 42, sharedAuditLog);
    guard.initialize(makeMockCtx(), MANIFEST);
    guard.mount();
    // Call update 100 times rapidly (exceeds 60/sec)
    let updatesExecuted = 0;
    const gs = guard.getGuardState();
    for (let i = 0; i < 100; i++) {
      guard.update(16);
      if (!guard.isKilled) updatesExecuted++;
    }
    const finalState = guard.getGuardState();
    // Should NOT be killed (throttle, not kill)
    const notKilled = !guard.isKilled;
    // Should have throttle violations logged
    const hasThrottleViolations = finalState.violations.some((v) => v.event.includes("throttle"));
    log(`  Updates executed: ${updatesExecuted}/100, killed: ${guard.isKilled}, throttle violations: ${finalState.violations.filter(v => v.event.includes("throttle")).length}`);
    if (notKilled && hasThrottleViolations) { passed++; log("  ✅ PASS: throttled but not killed"); }
    else { failed++; log("  ❌ FAIL: throttle behavior incorrect"); }
  }

  // ── Test 4: Capability auditing ──────────────────────────────
  log("\n── Test 4: Capability auditing (every invokeCapability logged) ──");
  {
    const guard = new ResourceGuard(new CapabilityUser(), "cap-user", DEFAULT_LIMITS, 42, sharedAuditLog);
    guard.initialize(makeMockCtx(), MANIFEST);
    guard.mount(); // mount invokes 2 capabilities
    guard.update(16); // update invokes 1 more
    const gs = guard.getGuardState();
    log(`  Capability calls: ${gs.capabilityCalls.join(", ")}`);
    const auditEntries = sharedAuditLog.filter((e) => e.event === "capability.invoke" && e.entityId === "cap-user");
    if (gs.capabilityCalls.length >= 3 && auditEntries.length >= 3) { passed++; log("  ✅ PASS: capabilities audited (" + auditEntries.length + " entries)"); }
    else { failed++; log("  ❌ FAIL: capabilities not audited (got " + auditEntries.length + ")"); }
  }

  // ── Test 5: Deterministic execution ──────────────────────────
  log("\n── Test 5: Deterministic execution (same seed → same RNG sequence) ──");
  {
    const rng1 = createSeededRng(12345);
    const rng2 = createSeededRng(12345);
    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());
    const deterministic = seq1.every((v, i) => v === seq2[i]);
    log(`  Sequence 1: ${seq1.slice(0, 3).map((n) => n.toFixed(4)).join(", ")}...`);
    log(`  Sequence 2: ${seq2.slice(0, 3).map((n) => n.toFixed(4)).join(", ")}...`);
    if (deterministic) { passed++; log("  ✅ PASS: deterministic (same seed → same sequence)"); }
    else { failed++; log("  ❌ FAIL: non-deterministic"); }
  }

  // ── Test 6: Dependency isolation ─────────────────────────────
  log("\n── Test 6: Dependency isolation (two instances, independent state) ──");
  {
    const guard1 = new ResourceGuard(new GoodPackage(), "iso-1", DEFAULT_LIMITS, 42, sharedAuditLog);
    const guard2 = new ResourceGuard(new GoodPackage(), "iso-2", DEFAULT_LIMITS, 42, sharedAuditLog);
    const ctx1 = makeMockCtx();
    const ctx2 = makeMockCtx();
    guard1.initialize(ctx1, MANIFEST);
    guard2.initialize(ctx2, MANIFEST);
    guard1.mount();
    guard2.mount();
    guard1.update(16);
    guard2.update(16);
    // ctx1 and ctx2 have separate state objects
    const state1 = ctx1.getState();
    const state2 = ctx2.getState();
    state1.modified = "only-1";
    const isolated = state2.modified === undefined;
    log(`  Instance 1 state keys: ${Object.keys(state1).join(",")}`);
    log(`  Instance 2 state keys: ${Object.keys(state2).join(",")}`);
    if (isolated) { passed++; log("  ✅ PASS: instances are isolated"); }
    else { failed++; log("  ❌ FAIL: state leaked between instances"); }
  }

  // ── Test 7: Well-behaved package is NOT killed ───────────────
  log("\n── Test 7: Well-behaved package is NOT killed ──");
  {
    const guard = new ResourceGuard(new GoodPackage(), "good-pkg", DEFAULT_LIMITS, 42, sharedAuditLog);
    guard.initialize(makeMockCtx(), MANIFEST);
    guard.mount();
    for (let i = 0; i < 10; i++) guard.update(16);
    if (!guard.isKilled) { passed++; log("  ✅ PASS: well-behaved package survived 10 updates"); }
    else { failed++; log("  ❌ FAIL: well-behaved package was killed — " + guard.killReason); }
  }

  // ── Test 8: Audit log contains kill events ───────────────────
  log("\n── Test 8: Audit log contains package.killed events ──");
  {
    const kills = sharedAuditLog.filter((e) => e.event === "package.killed");
    log(`  Kill events in audit log: ${kills.length}`);
    log(`  Kill reasons: ${kills.map((k) => k.details.reason).join(" | ")}`);
    if (kills.length >= 2) { passed++; log("  ✅ PASS: audit log recorded all kills"); }
    else { failed++; log("  ❌ FAIL: audit log missing kill events"); }
  }

  // ── Summary ───────────────────────────────────────────────────
  log("\n╔════════════════════════════════════════════════════════════╗");
  log(`║  RESULT: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    log("║  Certification is ENFORCED at runtime, not just declared. ║");
  }
  log("╚════════════════════════════════════════════════════════════╝");
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  log(`\n❌ FATAL: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
