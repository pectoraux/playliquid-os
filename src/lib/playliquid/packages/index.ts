// ════════════════════════════════════════════════════════════════
// EXECUTABLE PACKAGE INDEX
// ════════════════════════════════════════════════════════════════
//
// Maps package names to their executable implementations for the
// playliquid-web runtime target. In a full system, the browser runtime
// would fetch the RuntimeArtifact from the API and dynamically load
// the implementation from the artifactUri. For the MVP, we map known
// packages to their JS module implementations.
//
// The 3 genuinely different packages:
//   1. SpinningMarker — building family, ABI conformance test (rotates)
//   2. WalkerAvatar — avatar family, wanders + requests jump capability
//   3. CanalHouse — building family, toggles occupancy + requests enter capability
//   4. TramVehicle — vehicle family, moves along route + boards passengers
//
// Each uses KernelContext exclusively — no globalThis, no direct DOM/network access.

import type { PackageRuntimeABI } from "../package-abi";
import { SpinningMarkerPackage } from "./spinning-marker";
import { WalkerAvatarPackage } from "./walker-avatar";
import { CanalHousePackage } from "./canal-house";
import { TramVehiclePackage } from "./tram-vehicle";

// Map of package name → executable implementation
export const executablePackages: Map<string, PackageRuntimeABI> = new Map([
  ["@playliquid/examples/spinning-marker", SpinningMarkerPackage],
  ["@playliquid/avatars/walker-executable", WalkerAvatarPackage],
  ["@playliquid/avatars/walker", WalkerAvatarPackage], // alias for the seeded walker
  ["@playliquid/buildings/canal-house-executable", CanalHousePackage],
  ["@playliquid/buildings/canal-house", CanalHousePackage], // alias for the seeded canal house
  ["@playliquid/vehicles/tram-executable", TramVehiclePackage],
]);

// Default implementation by family — used when a package doesn't have
// a specific executable implementation but needs a runtime behavior.
// This is NOT an escape hatch; it's a fallback that maps family →
// a known-good executable that conforms to the ABI.
export const familyDefaults: Map<string, PackageRuntimeABI> = new Map([
  ["avatar", WalkerAvatarPackage],
  ["building", CanalHousePackage],
  ["vehicle", TramVehiclePackage],
]);

// Resolve a package implementation: try exact name match first,
// then fall back to family default.
export function resolvePackageImplementation(
  packageName: string,
  family: string
): PackageRuntimeABI | null {
  return executablePackages.get(packageName) ?? familyDefaults.get(family) ?? null;
}
