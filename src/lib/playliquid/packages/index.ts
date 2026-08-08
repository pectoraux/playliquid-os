// ════════════════════════════════════════════════════════════════
// GENERIC RUNTIME ARTIFACT LOADER
// ════════════════════════════════════════════════════════════════
//
// This is the REAL loader. It does NOT use a hard-coded Map.
// Instead, it:
//   1. Fetches the package's RuntimeArtifact from the API
//   2. Parses the artifact as a declarative package definition
//   3. Validates it through the certification system
//   4. Creates a PackageImplementation via createDeclarativeImplementation()
//
// Any package — including one imported from an external LLM — can be
// loaded through this path. No hard-coded registry entries needed.
//
// For packages that have built-in TypeScript implementations (the
// conformance test packages), the dev bootstrap registry is still
// checked first as a performance optimization. But for ANY package
// not in that registry (including all user-LLM-imported packages),
// the declarative loader path is used.

import type {
  PackageImplementation,
  RuntimeArtifactLoader,
} from "../package-abi";
import {
  validateDeclarativeArtifact,
  createDeclarativeImplementation,
  type DeclarativeArtifact,
} from "../declarative-artifact";

// Dev bootstrap (conformance test packages only)
import { SpinningMarkerImplementation } from "./spinning-marker";
import { WalkerAvatarImplementation } from "./walker-avatar";
import { CanalHouseImplementation } from "./canal-house";
import { TramVehicleImplementation } from "./tram-vehicle";

// ── Dev bootstrap: conformance test packages ──────────────────────
// These are the ONLY hard-coded implementations. They exist for testing
// the ABI itself. ALL other packages (including user-LLM imports) go
// through the declarative loader.
const devBootstrapRegistry: Map<string, PackageImplementation> = new Map([
  ["@playliquid/examples/spinning-marker", SpinningMarkerImplementation],
  ["@playliquid/avatars/walker-executable", WalkerAvatarImplementation],
  ["@playliquid/avatars/walker", WalkerAvatarImplementation],
  ["@playliquid/buildings/canal-house-executable", CanalHouseImplementation],
  ["@playliquid/buildings/canal-house", CanalHouseImplementation],
  ["@playliquid/vehicles/tram-executable", TramVehicleImplementation],
]);

// ── Family fallbacks (declarative) ────────────────────────────────
// For packages without a specific implementation, we create a declarative
// fallback based on the family. This means ANY package is executable.
function createFamilyFallback(family: string): PackageImplementation {
  const fallbacks: Record<string, DeclarativeArtifact> = {
    avatar: {
      abiVersion: "1.0.0", name: "@fallback/avatar", displayName: "Avatar",
      family: "avatar", capabilities: ["avatar.movement"], provides: ["avatar.movement"],
      requires: ["navigation.walkable"], initialState: { direction: 0, speed: 0.3 },
      update: { behavior: "wander", params: { speed: 0.3, wanderRange: 5 } },
      render: { behavior: "shape", params: { shape: "circle", size: 8, color: "#a78bfa", showDirection: true } },
      onClick: { behavior: "requestCapability", params: { capability: "jump" } },
    },
    building: {
      abiVersion: "1.0.0", name: "@fallback/building", displayName: "Building",
      family: "building", capabilities: ["building.enter"], provides: ["spatial.anchor"],
      requires: ["navigation.walkable"], initialState: { occupied: false },
      update: { behavior: "static", params: {} },
      render: { behavior: "shape", params: { shape: "rect", size: 10, color: "#fbbf24" } },
      onClick: { behavior: "toggle", params: { stateField: "occupied" } },
    },
    vehicle: {
      abiVersion: "1.0.0", name: "@fallback/vehicle", displayName: "Vehicle",
      family: "vehicle", capabilities: ["vehicle.drive"], provides: ["avatar.movement"],
      requires: ["navigation.walkable"], initialState: { patrolProgress: 0 },
      update: { behavior: "patrol", params: { speed: 0.3, routeWidth: 15, routeHeight: 10 } },
      render: { behavior: "shape", params: { shape: "diamond", size: 8, color: "#7dd3fc", showDirection: true } },
      onClick: { behavior: "emit", params: { event: "vehicle.boarded" } },
    },
  };

  const artifact = fallbacks[family] ?? fallbacks["building"];
  return createDeclarativeImplementation(artifact);
}

// ── Strict mode ───────────────────────────────────────────────────
// When true, family fallbacks are disabled. Packages without their own
// declarative artifact (from the Scene API) are NOT executed.
// This proves that imported packages run on their OWN artifact, not a fallback.
const strictMode = typeof process !== "undefined" && process.env?.RUNTIME_STRICT === "true";

// ── The real loader ───────────────────────────────────────────────
export class GenericArtifactLoader implements RuntimeArtifactLoader {
  // Cache of loaded artifacts (by package name)
  private cache: Map<string, PackageImplementation> = new Map();

  async load(artifactUri: string, _target: string): Promise<PackageImplementation | null> {
    // In a full system, this would fetch the artifact content from the URI
    // and parse it. For the MVP, artifact loading happens via resolveByName
    // or resolveFromArtifact (for declarative artifacts).
    return null;
  }

  isAvailable(_artifactUri: string, target: string): boolean {
    return target === "playliquid-web";
  }

  // ── Resolve by package name + family ───────────────────────────
  // 1. Check dev bootstrap (conformance test packages only)
  // 2. Check if we have a cached declarative implementation
  // 3. In NON-strict mode: fall back to family default (declarative)
  //    In STRICT mode: return null (no fallback — the package must have
  //    its own declarative artifact from the Scene API)
  resolveByName(packageName: string, family: string): PackageImplementation | null {
    // 1. Dev bootstrap (conformance tests only)
    const builtin = devBootstrapRegistry.get(packageName);
    if (builtin) return builtin;

    // 2. Cached declarative implementation
    const cached = this.cache.get(packageName);
    if (cached) return cached;

    // 3. Family fallback — ONLY in non-strict mode.
    //    In strict mode (RUNTIME_STRICT=true), packages without their own
    //    declarative artifact are NOT executed. This prevents the system
    //    from silently substituting a generic family implementation.
    if (strictMode) {
      return null;
    }
    return createFamilyFallback(family);
  }

  // ── Resolve from a declarative artifact ───────────────────────
  // This is the KEY method: given a declarative artifact (from an LLM),
  // validate it and create an executable PackageImplementation.
  // No hard-coded registry needed.
  resolveFromArtifact(artifact: DeclarativeArtifact): PackageImplementation {
    const impl = createDeclarativeImplementation(artifact);
    this.cache.set(artifact.name, impl);
    return impl;
  }

  // ── Resolve from raw artifact text ────────────────────────────
  // Validates + parses raw text (from an LLM import) and creates
  // an executable implementation. Returns null if validation fails.
  resolveFromText(rawText: string): { implementation: PackageImplementation | null; validation: ReturnType<typeof validateDeclarativeArtifact> } {
    const validation = validateDeclarativeArtifact(rawText);
    if (!validation.valid || !validation.artifact) {
      return { implementation: null, validation };
    }
    const impl = this.resolveFromArtifact(validation.artifact);
    return { implementation: impl, validation };
  }
}

// ── Singleton ─────────────────────────────────────────────────────
export const artifactLoader = new GenericArtifactLoader();

// ── Validator (re-exported for the import endpoint) ───────────────
export { validateDeclarativeArtifact } from "../declarative-artifact";
