// ════════════════════════════════════════════════════════════════
// RUNTIME ARTIFACT LOADER + VALIDATOR
// ════════════════════════════════════════════════════════════════
//
// Phase A: a real RuntimeArtifact loader. The browser runtime resolves
// implementations through this loader, not a hard-coded Map.
//
// The loader has two layers:
//   1. A built-in registry of known packages (for the MVP — these are
//      the conformance test packages). In a full system, this would
//      be replaced by a dynamic module loader that fetches artifacts
//      from the artifactUri and evaluates them in a sandbox.
//   2. A validator that checks imported artifacts for ABI conformance.
//
// The validator is the certification gate: an imported artifact must
// pass validation before it becomes a certified RuntimeArtifact.

import type {
  PackageImplementation,
  RuntimeArtifactLoader,
  ArtifactValidator,
  ValidationResult,
} from "../package-abi";
import { SpinningMarkerImplementation } from "./spinning-marker";
import { WalkerAvatarImplementation } from "./walker-avatar";
import { CanalHouseImplementation } from "./canal-house";
import { TramVehicleImplementation } from "./tram-vehicle";

// ── DEVELOPMENT BOOTSTRAP REGISTRY ────────────────────────────────
// WARNING: This is a DEVELOPMENT BOOTSTRAP, not the Package Runtime.
//
// In a production PlayLiquid system, the loader would fetch the
// RuntimeArtifact from the API and dynamically load the JS module
// from the artifactUri in a sandbox. This hard-coded Map is a
// temporary mechanism for the MVP — it maps known package names to
// their TypeScript implementations for testing.
//
// For packages NOT in this map (including user-LLM-imported packages),
// the family fallback provides a default executable behavior. This
// means any imported package IS executable — it gets the family's
// default implementation. In a full system, the actual LLM-generated
// JS code would be loaded instead.
//
// This registry MUST be replaced by a dynamic artifact loader before
// the system can execute arbitrary certified RuntimeArtifacts.
const devBootstrapRegistry: Map<string, PackageImplementation> = new Map([
  ["@playliquid/examples/spinning-marker", SpinningMarkerImplementation],
  ["@playliquid/avatars/walker-executable", WalkerAvatarImplementation],
  ["@playliquid/avatars/walker", WalkerAvatarImplementation],
  ["@playliquid/buildings/canal-house-executable", CanalHouseImplementation],
  ["@playliquid/buildings/canal-house", CanalHouseImplementation],
  ["@playliquid/vehicles/tram-executable", TramVehicleImplementation],
]);

// Family-based fallback implementations (for packages without a specific impl)
const familyFallbacks: Map<string, PackageImplementation> = new Map([
  ["avatar", WalkerAvatarImplementation],
  ["building", CanalHouseImplementation],
  ["vehicle", TramVehicleImplementation],
]);

// ── The loader ────────────────────────────────────────────────────
export class PlayLiquidWebArtifactLoader implements RuntimeArtifactLoader {
  // In a full system, this would fetch the artifact from the URI
  // and evaluate it in a sandbox. For the MVP, it resolves from
  // the built-in registry.
  async load(artifactUri: string, _target: string): Promise<PackageImplementation | null> {
    // The artifactUri encodes the package name for built-in packages
    // Format: "playliquid-web://<hash>" or "memory://<hash>" or "user-import://<hash>"
    // For the MVP, we resolve by package name (passed via a side channel)
    // In a full system, this would be a dynamic import / eval in a sandbox
    return null; // resolved by name in resolveByName
  }

  isAvailable(artifactUri: string, target: string): boolean {
    return target === "playliquid-web";
  }

  // Resolve by package name + family
  // Phase A: uses the dev bootstrap registry for known packages.
  // Falls back to family default for unknown/imported packages.
  // In production, this would dynamically load from the RuntimeArtifact.
  resolveByName(packageName: string, family: string): PackageImplementation | null {
    return devBootstrapRegistry.get(packageName) ?? familyFallbacks.get(family) ?? null;
  }
}

// ── The validator ─────────────────────────────────────────────────
// Validates that an imported artifact conforms to the Package Runtime ABI.
// This is the certification gate.
export class PackageArtifactValidator implements ArtifactValidator {
  validate(artifact: unknown): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (typeof artifact !== "string") {
      errors.push("Artifact must be a string (the package implementation code)");
      return { valid: false, errors, warnings };
    }

    if (artifact.length === 0) {
      errors.push("Artifact is empty");
      return { valid: false, errors, warnings };
    }

    // Check for ABI conformance markers
    // In a full system, this would parse the JS and check for:
    //   - createInstance() method
    //   - ABI lifecycle methods
    //   - no direct fetch/WebSocket/localStorage access
    //   - no globalThis mutation
    // For the MVP, we do structural checks:

    if (artifact.length < 10) {
      warnings.push("Artifact is very short — may not be a real implementation");
    }

    // Check for dangerous patterns (basic sandbox check)
    const dangerousPatterns = [
      { pattern: /fetch\s*\(/, msg: "Direct fetch() call — packages must use requestService()" },
      { pattern: /WebSocket/, msg: "Direct WebSocket access — packages must use requestService()" },
      { pattern: /localStorage/, msg: "Direct localStorage access — packages must use KernelContext state" },
      { pattern: /globalThis\s*\./, msg: "globalThis mutation — packages must use KernelContext" },
      { pattern: /document\./, msg: "Direct DOM access — packages must use RenderContext" },
      { pattern: /window\./, msg: "Direct window access — packages must use KernelContext" },
    ];

    for (const { pattern, msg } of dangerousPatterns) {
      if (pattern.test(artifact)) {
        warnings.push(msg);
      }
    }

    // For the MVP, we accept all non-empty artifacts with warnings
    // In a full system, warnings would become errors for untrusted sources
    return {
      valid: true,
      errors,
      warnings,
    };
  }
}

// Singleton instances
export const artifactLoader = new PlayLiquidWebArtifactLoader();
export const artifactValidator = new PackageArtifactValidator();
