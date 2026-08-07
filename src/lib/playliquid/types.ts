// Playliquid OS — Core Type Definitions
// Canonical shapes for the 9 frozen primitives.

export type Family =
  | "avatar"
  | "building"
  | "road"
  | "vehicle"
  | "creature"
  | "physics"
  | "weather"
  | "economy"
  | "audio"
  | "ai"
  | "knowledge"
  | "sensor"
  | "sensory"
  | "renderer"
  | "input"
  | "infrastructure";

export interface InterfaceContract {
  id: string;
  name: string; // e.g. "spatial.anchor"
  family: string; // e.g. "spatial"
  version: string;
  direction: "provides" | "requires";
  schema: Record<string, unknown>;
  description: string;
}

export interface Manifest {
  entrypoint?: string;
  runtime?: "browser" | "wasm" | "native" | "cloud" | "simulator";
  resources?: string[];
  config?: Record<string, unknown>;
}

export interface Provenance {
  generator: "llm" | "human" | "scan" | "import";
  llmProvider?: string;
  model?: string;
  generatedAt?: string;
  source?: string;
}

export interface Certification {
  signed: boolean;
  level: "none" | "basic" | "verified" | "certified";
  by?: string;
  checks: string[];
}

export interface PackageRecord {
  id: string;
  name: string;
  displayName: string;
  description: string;
  family: Family;
  version: string;
  hash: string;
  manifest: Manifest;
  specification: Record<string, unknown>;
  artifactUri?: string | null;
  provenance: Provenance;
  certification: Certification;
  license: string;
  capabilities: string[];
  provides: InterfaceContract[];
  requires: InterfaceContract[];
  createdAt: string;
  updatedAt: string;
}

export interface SpecificationRecord {
  id: string;
  naturalLanguage?: string | null;
  canonical: Record<string, unknown>;
  kind: "package" | "world" | "entity";
  theme?: Record<string, unknown> | null;
  spatialRules?: Record<string, unknown> | null;
  policies?: Record<string, unknown> | null;
  createdAt: string;
}

export interface WorldTheme {
  era: string;
  artDirection: string;
  scale: string;
  coordinateSystem: string;
  architectureLanguage: string;
  materialLanguage: string;
  lighting: string;
  colorLanguage: string;
  technologyLevel: string;
  allowedFamilies: string[];
  preferredFamilies: string[];
  excludedFamilies: string[];
}

export interface WorldProjectRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  theme: WorldTheme;
  rules: Record<string, unknown>;
  packageManifest: string[];
  contributors: string[];
  specification?: SpecificationRecord | null;
  builds: WorldBuildRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface WorldBuildRecord {
  id: string;
  version: number;
  worldProjectId: string;
  manifest: BuildManifest;
  hash: string;
  status: "draft" | "composed" | "ready";
  packages: PackageRecord[];
  entities: EntityRecord[];
  nodes: WorldNodeRecord[];
  createdAt: string;
}

export interface BuildManifest {
  specificationHash: string;
  packageVersions: Record<string, string>; // name -> version
  resolvedDependencies: Array<{ from: string; to: string; contract: string }>;
  interfaceConnections: Array<{
    provider: string;
    consumer: string;
    contract: string;
  }>;
  spatialGraph: Array<{ entity: string; parent?: string; anchor: { x: number; y: number; z: number } }>;
  capabilityPolicies: Record<string, string>;
  runtimeConfig: Record<string, unknown>;
  theme: WorldTheme;
}

export interface EntityRecord {
  id: string;
  worldBuildId: string;
  packageId: string;
  package?: PackageRecord;
  name: string;
  position: { x: number; y: number; z: number };
  components: string[];
  state: Record<string, unknown>;
  createdAt: string;
}

export type NodeStatus = "starting" | "running" | "stopped" | "error";
export type NodeHost = "vercel" | "aws" | "local" | "edge" | "cloud";

export interface WorldNodeRecord {
  id: string;
  worldBuildId: string;
  host: NodeHost;
  endpoint: string;
  status: NodeStatus;
  health: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  startedAt?: string | null;
  createdAt: string;
}

export interface KernelEventRecord {
  id: string;
  entityId?: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface GenerationRequestRecord {
  id: string;
  input: string;
  specification: Record<string, unknown>;
  prompt: string;
  provider: string;
  status: string;
  packageId?: string | null;
  log: Array<{ step: string; at: string; detail?: string }>;
  createdAt: string;
}

// ── Architecture manifest (frozen) ───────────────────────────────
export interface ArchitectureManifest {
  primitives: Array<{
    id: number;
    name: string;
    role: string;
    frozen: true;
  }>;
  pipelines: Array<{ name: string; stages: string[] }>;
  laws: string[];
  extensionTable: Array<{ capability: string; extensionPoint: string }>;
}

// ── Pipeline: NL → Specification → Prompt ────────────────────────
export interface CompiledPrompt {
  specification: Record<string, unknown>;
  context: {
    worldTheme?: WorldTheme;
    spatialContract?: Record<string, unknown>;
    neighbors?: string[];
    dependencyGraph?: string[];
  };
  prompt: string;
}

export interface ResolveResult {
  reused: PackageRecord[];
  generated: PackageRecord[];
  missing: SpecificationRecord[];
}

export type ReusePolicy =
  | "reuse-all"
  | "reuse-infrastructure-only"
  | "reuse-none"
  | "auto";
