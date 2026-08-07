// ════════════════════════════════════════════════════════════════
// PLAYLIQUID PROTOCOL v1 — FROZEN VERSION SPECIFICATION
// ════════════════════════════════════════════════════════════════
//
// R0: Protocol Freeze. Every protocol has an explicit version.
// The runtime enforces compatibility — an artifact with an incompatible
// protocol version is rejected, not silently executed.

export const PROTOCOL_VERSIONS = {
  // The overall PlayLiquid Protocol
  playliquid: { major: 1, minor: 0, patch: 0 },

  // Package Runtime ABI — the lifecycle contract
  // initialize → mount → update → handle → render → dispose
  packageABI: { major: 1, minor: 0, patch: 0 },

  // World Scene Protocol — the engine-independent scene graph
  // World identity + spatial anchors + entities + capabilities + runtime config
  worldScene: { major: 1, minor: 0, patch: 0 },

  // Spatial Anchor Protocol — canonical coordinates + semantic identity
  // Global coords, local coords, orientation, scale, parent hierarchy
  spatialAnchor: { major: 1, minor: 0, patch: 0 },

  // Capability Protocol — multi-layer negotiation
  // entity caps × world policy × zone policy × experience policy = effective
  capability: { major: 1, minor: 0, patch: 0 },

  // Runtime Artifact Format — the declarative IR
  // abiVersion, name, family, capabilities, provides, requires,
  // initialState, update, render, onClick
  runtimeArtifact: { major: 1, minor: 0, patch: 0 },

  // World Build Manifest — the immutable composition artifact
  // manifestLock with content-addressed package hashes + interface versions
  worldBuild: { major: 1, minor: 0, patch: 0 },

  // State Synchronization Protocol — authoritative state + SSE replication
  // snapshot → delta stream → reconnect convergence
  stateSync: { major: 1, minor: 0, patch: 0 },

  // Event Protocol — world events in engine-independent format
  // type, payload, worldId, entityId, sequence, timestamp, authority
  event: { major: 1, minor: 0, patch: 0 },

  // Service Contract Protocol — how packages request OS services
  // requestService(service, action, params) → result
  serviceContract: { major: 1, minor: 0, patch: 0 },

  // Coordinate System — canonical PlayLiquid world coordinates
  // Right-handed, meters, X=east, Y=up, Z=north
  coordinateSystem: { major: 1, minor: 0, patch: 0 },
} as const;

export type ProtocolName = keyof typeof PROTOCOL_VERSIONS;

// ── Version string helper ─────────────────────────────────────────
export function versionString(v: { major: number; minor: number; patch: number }): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

// ── Compatibility check ───────────────────────────────────────────
// An artifact declaring version X.Y.Z is compatible with runtime version
// A.B.C if X === A (same major version).
// Minor version differences are backward-compatible.
// Patch version differences are always compatible.
export function isCompatible(
  artifactVersion: string,
  runtimeVersion: { major: number; minor: number; patch: number }
): { compatible: boolean; reason?: string } {
  const parts = artifactVersion.split(".").map(Number);
  if (parts.length < 2) {
    return { compatible: false, reason: `Invalid version format: "${artifactVersion}"` };
  }
  const [aMajor, aMinor] = parts;

  if (aMajor !== runtimeVersion.major) {
    return {
      compatible: false,
      reason: `Major version mismatch: artifact v${artifactVersion} vs runtime v${versionString(runtimeVersion)}`,
    };
  }

  if (aMinor > runtimeVersion.minor) {
    return {
      compatible: false,
      reason: `Artifact requires newer minor version: artifact v${artifactVersion} vs runtime v${versionString(runtimeVersion)}`,
    };
  }

  return { compatible: true };
}

// ── Check all protocols an artifact uses ──────────────────────────
export function checkArtifactCompatibility(artifact: {
  abiVersion?: string;
}): { compatible: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check Package ABI version
  if (artifact.abiVersion) {
    const result = isCompatible(artifact.abiVersion, PROTOCOL_VERSIONS.packageABI);
    if (!result.compatible && result.reason) {
      issues.push(`PackageABI: ${result.reason}`);
    }
  } else {
    issues.push("PackageABI: missing abiVersion field");
  }

  return {
    compatible: issues.length === 0,
    issues,
  };
}

// ── Protocol version for the Scene API response ───────────────────
export function getSceneProtocolVersion(): string {
  return versionString(PROTOCOL_VERSIONS.worldScene);
}

// ── Protocol version for the state sync stream ────────────────────
export function getStateSyncProtocolVersion(): string {
  return versionString(PROTOCOL_VERSIONS.stateSync);
}
