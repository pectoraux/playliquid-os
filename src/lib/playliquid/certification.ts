// ════════════════════════════════════════════════════════════════
// PACKAGE CERTIFICATION SYSTEM — R2
// ════════════════════════════════════════════════════════════════
//
// Every package gets a certification record with:
//   - artifactHash (content-addressed)
//   - abiVersion + protocolVersion compatibility
//   - capabilitiesRequested (declared capabilities)
//   - servicesRequested (OS services the package needs)
//   - resourceLimits (CPU, memory, state keys, execution frequency)
//   - runtimeTargets (which adapters can execute it)
//   - certificationLevel (none → basic → verified → certified)
//   - certificationEvidence (what checks passed)
//
// Certification is a real subsystem — not just a boolean flag.

import { contentHash } from "./hashing";
import { isCompatible, PROTOCOL_VERSIONS, versionString } from "./protocol-versions";
import { validateDeclarativeArtifact } from "./declarative-artifact";
import { validateExecutableArtifact } from "./executable-artifact";

export type CertificationLevel = "none" | "basic" | "verified" | "certified";
export type ArtifactType = "declarative-ir" | "executable-sandboxed";

export interface CertificationRecord {
  artifactHash: string;
  artifactType: ArtifactType;
  abiVersion: string;
  protocolVersion: string;
  capabilitiesRequested: string[];
  servicesRequested: string[];
  resourceLimits: ResourceLimits;
  runtimeTargets: string[];
  certificationLevel: CertificationLevel;
  certificationEvidence: CertificationEvidence;
  certifiedAt: string;
}

export interface ResourceLimits {
  maxCpuMs: number;       // max CPU time per update() call
  maxMemoryMb: number;    // max memory usage
  maxStateKeys: number;   // max number of state keys
  maxUpdateRate: number;  // max updates per second
}

export interface CertificationEvidence {
  abiValid: boolean;
  protocolCompatible: boolean;
  capabilitiesDeclared: boolean;
  securityChecksPassed: boolean;
  structureValid: boolean;
  resourceLimitsSet: boolean;
  checks: string[];
  warnings: string[];
  errors: string[];
}

export const DEFAULT_LIMITS: ResourceLimits = {
  maxCpuMs: 16,       // ~60fps budget
  maxMemoryMb: 10,
  maxStateKeys: 100,
  maxUpdateRate: 60,
};

// ── Certify a package artifact ────────────────────────────────────
export function certifyArtifact(
  rawArtifact: unknown,
  packageName: string
): { certified: boolean; record: CertificationRecord } {
  const checks: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  let artifactType: ArtifactType = "declarative-ir";
  let abiVersion = "";
  let capabilities: string[] = [];
  let services: string[] = [];
  let limits = { ...DEFAULT_LIMITS };

  // Parse if string
  let parsed = rawArtifact;
  if (typeof rawArtifact === "string") {
    try {
      parsed = JSON.parse(rawArtifact);
    } catch {
      errors.push("Artifact is not valid JSON");
      return { certified: false, record: failedRecord(packageName, errors) };
    }
  }

  const a = parsed as Record<string, unknown>;
  abiVersion = (a.abiVersion as string) ?? "";

  // ── Check 1: ABI version ────────────────────────────────────────
  const abiValid = !!abiVersion;
  if (!abiValid) {
    errors.push("Missing abiVersion");
  } else {
    checks.push("abiVersion present");
  }

  // ── Check 2: Protocol compatibility ─────────────────────────────
  let protocolCompatible = false;
  if (abiVersion) {
    const compat = isCompatible(abiVersion, PROTOCOL_VERSIONS.packageABI);
    protocolCompatible = compat.compatible;
    if (!compat.compatible) {
      errors.push(`Protocol incompatibility: ${compat.reason}`);
    } else {
      checks.push("protocol version compatible");
    }
  }

  // ── Check 3: Determine artifact type + validate ────────────────
  let structureValid = false;
  if (a.code && typeof a.code === "string") {
    // Executable artifact (Tier B)
    artifactType = "executable-sandboxed";
    const validation = validateExecutableArtifact(parsed);
    structureValid = validation.valid;
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      checks.push("executable artifact structure valid");
    }
    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings);
    }
    // Check for security violations
    if (validation.errors.some((e) => e.includes("Security violation"))) {
      errors.push("Security violations detected — certification denied");
    }
  } else {
    // Declarative artifact (Tier A)
    artifactType = "declarative-ir";
    const validation = validateDeclarativeArtifact(parsed);
    structureValid = validation.valid;
    if (!validation.valid) {
      errors.push(...validation.errors);
    } else {
      checks.push("declarative artifact structure valid");
    }
    if (validation.warnings.length > 0) {
      warnings.push(...validation.warnings);
    }
  }

  // ── Check 4: Capabilities declared ─────────────────────────────
  capabilities = (a.capabilities as string[]) ?? [];
  const capabilitiesDeclared = Array.isArray(capabilities) && capabilities.length >= 0;
  if (capabilitiesDeclared) {
    checks.push(`${capabilities.length} capabilities declared`);
  } else {
    errors.push("Capabilities not properly declared");
  }

  // ── Check 5: Security checks ───────────────────────────────────
  const securityChecksPassed = !errors.some((e) => e.includes("Security violation"));
  if (securityChecksPassed) {
    checks.push("security checks passed (no dangerous patterns)");
  }

  // ── Check 6: Resource limits ───────────────────────────────────
  if (a.limits && typeof a.limits === "object") {
    const l = a.limits as Record<string, number>;
    limits = {
      maxCpuMs: l.maxCpuMs ?? DEFAULT_LIMITS.maxCpuMs,
      maxMemoryMb: l.maxMemoryMb ?? DEFAULT_LIMITS.maxMemoryMb,
      maxStateKeys: l.maxStateKeys ?? DEFAULT_LIMITS.maxStateKeys,
      maxUpdateRate: l.maxUpdateRate ?? DEFAULT_LIMITS.maxUpdateRate,
    };
    checks.push("resource limits specified");
  } else {
    checks.push("default resource limits applied");
  }

  // ── Check 7: Services requested ───────────────────────────────
  services = (a.services as string[]) ?? [];

  // ── Determine certification level ──────────────────────────────
  let level: CertificationLevel = "none";
  if (errors.length === 0) {
    if (artifactType === "declarative-ir") {
      level = structureValid && protocolCompatible ? "verified" : "basic";
    } else {
      level = structureValid && protocolCompatible && securityChecksPassed ? "certified" : "basic";
    }
  }

  const artifactHash = contentHash({ rawArtifact, packageName, abiVersion });

  const record: CertificationRecord = {
    artifactHash,
    artifactType,
    abiVersion,
    protocolVersion: versionString(PROTOCOL_VERSIONS.playliquid),
    capabilitiesRequested: capabilities,
    servicesRequested: services,
    resourceLimits: limits,
    runtimeTargets: ["playliquid-web"],
    certificationLevel: level,
    certificationEvidence: {
      abiValid,
      protocolCompatible,
      capabilitiesDeclared,
      securityChecksPassed,
      structureValid,
      resourceLimitsSet: true,
      checks,
      warnings,
      errors,
    },
    certifiedAt: new Date().toISOString(),
  };

  return { certified: errors.length === 0, record };
}

function failedRecord(packageName: string, errors: string[]): CertificationRecord {
  return {
    artifactHash: contentHash({ packageName, failed: true }),
    artifactType: "declarative-ir",
    abiVersion: "unknown",
    protocolVersion: "unknown",
    capabilitiesRequested: [],
    servicesRequested: [],
    resourceLimits: DEFAULT_LIMITS,
    runtimeTargets: [],
    certificationLevel: "none",
    certificationEvidence: {
      abiValid: false,
      protocolCompatible: false,
      capabilitiesDeclared: false,
      securityChecksPassed: false,
      structureValid: false,
      resourceLimitsSet: false,
      checks: [],
      warnings: [],
      errors,
    },
    certifiedAt: new Date().toISOString(),
  };
}
