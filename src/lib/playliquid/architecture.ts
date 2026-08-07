// Frozen architecture manifest. Single source of truth for the OS surface.
import type { ArchitectureManifest } from "./types";

export const ARCHITECTURE: ArchitectureManifest = {
  primitives: [
    {
      id: 1,
      name: "Package",
      role: "Everything that exists in a World is a Package — assets, systems, sensory devices, renderers.",
      frozen: true,
    },
    {
      id: 2,
      name: "Specification",
      role: "Canonical truth. Distinct from NL, prompt, and generated artifact.",
      frozen: true,
    },
    {
      id: 3,
      name: "Interface / Contract",
      role: "Capability families. Packages provide/require. The Composer wires them.",
      frozen: true,
    },
    {
      id: 4,
      name: "Entity",
      role: "A Package instantiated into a running World.",
      frozen: true,
    },
    {
      id: 5,
      name: "World Project",
      role: "Git-like collaborative source repository for a World.",
      frozen: true,
    },
    {
      id: 6,
      name: "World Build",
      role: "Immutable, reproducible composition artifact.",
      frozen: true,
    },
    {
      id: 7,
      name: "Kernel",
      role: "Scheduler, event bus, entity lifecycle, capabilities, state — all abstractions.",
      frozen: true,
    },
    {
      id: 8,
      name: "Runtime Adapter",
      role: "Boundary so browser/WASM/native/VR/AR/cloud can all implement the same contract.",
      frozen: true,
    },
    {
      id: 9,
      name: "World Node",
      role: "Deployable runtime instance of a Build. Host is an implementation detail.",
      frozen: true,
    },
  ],
  pipelines: [
    {
      name: "Generation",
      stages: [
        "Natural Language",
        "Specification",
        "Package Resolution",
        "Prompt Generation",
        "User's LLM",
        "Package",
        "Certification",
        "Registry",
        "Composition",
        "World Build",
        "World Node",
        "Runtime",
      ],
    },
    {
      name: "Multimodal",
      stages: [
        "Photo / Video / Audio / Scan",
        "Observation → Specification",
        "…same pipeline…",
      ],
    },
  ],
  laws: [
    "No future feature may introduce a fundamental object that bypasses Package, Specification, Contract, Entity, World Project, World Build, Kernel, or Runtime Adapter.",
    "No future feature should require the user's LLM to implement functionality that belongs to the PlayLiquid Kernel or platform services.",
    "No future feature should require PlayLiquid to own the user's implementation model, LLM, or hosting infrastructure.",
  ],
  extensionTable: [
    { capability: "Multiplayer", extensionPoint: "Kernel / Network Service" },
    { capability: "Dedicated servers", extensionPoint: "World Node" },
    { capability: "P2P worlds", extensionPoint: "World Node" },
    { capability: "Streaming", extensionPoint: "Kernel / Spatial Service" },
    { capability: "Persistence", extensionPoint: "Kernel / Persistence Service" },
    { capability: "Avatars", extensionPoint: "Package + Entity" },
    { capability: "Physics", extensionPoint: "Runtime Adapter / Package" },
    { capability: "Rendering", extensionPoint: "Runtime Adapter" },
    { capability: "VR", extensionPoint: "Runtime Adapter" },
    { capability: "AR", extensionPoint: "Runtime Adapter" },
    { capability: "Audio", extensionPoint: "Package + Runtime Service" },
    { capability: "Smell", extensionPoint: "Sensory Package / Runtime Adapter" },
    { capability: "Haptics", extensionPoint: "Sensory Package / Runtime Adapter" },
    { capability: "Economy", extensionPoint: "Kernel Service" },
    { capability: "AI agents", extensionPoint: "Entity + Knowledge/AI Package" },
    { capability: "Real-world reconstruction", extensionPoint: "Multimodal → Specification" },
    { capability: "New LLM providers", extensionPoint: "Provider Adapter" },
    { capability: "New hosting providers", extensionPoint: "World Node Adapter" },
    { capability: "New execution technology", extensionPoint: "Runtime Adapter" },
  ],
};
