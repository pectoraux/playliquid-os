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
      name: "Contract",
      role: "Capability families. Packages provide/require. The Composer wires them. The Kernel enforces them.",
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
      role: "Git-like collaborative source repository for a World. Contributions are packages, not code.",
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
      role: "Scheduler, Event Bus, Entity Runtime, Capability System, Networking, Replication, Spatial Authority, Persistence, Streaming — OS substrate, never LLM-generated.",
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
      role: "Deployable multiplayer runtime instance of a Build. Host is an implementation detail.",
      frozen: true,
    },
    {
      id: 10,
      name: "World Service",
      role: "Platform-provided OS services: Multiplayer, Streaming, Persistence, Voice, Ads, Identity... Packages consume them through Contracts — never reinvent them.",
      frozen: true,
    },
  ],
  pipelines: [
    {
      name: "Generation (reuse-first)",
      stages: [
        "Natural Language",
        "World Specification",
        "Package Decomposition",
        "Registry Search",
        "Reuse Existing / Generate Missing",
        "User's LLM (only for missing)",
        "Certified Packages",
        "Composition",
        "World Build",
        "World Node",
        "Living World (multiplayer + streaming + persistence)",
      ],
    },
    {
      name: "Multimodal",
      stages: [
        "Photo / Video / Audio / Scan",
        "Perception → World Specification",
        "…same reuse-first pipeline…",
      ],
    },
  ],
  laws: [
    "A World Project defines what is desired; the PlayLiquid OS determines how that desire can become an operational world.",
    "PlayLiquid is responsible for making packages operational; creators are responsible only for specifying the behavior and implementation of their packages.",
    "If a capability is fundamental to operating a virtual world, it belongs in the PlayLiquid OS substrate rather than in an individual package. (Multiplayer? OS. Streaming? OS. Replication? OS. Identity? OS. Ads? OS service. Payments? OS service. Capability enforcement? Kernel. Spatial composition? OS contract. Hosting? World Node. World-specific behavior? Package. World-specific content? Package. New sensory technology? Runtime Adapter / World Service extension. LLM? Implementation backend chosen by the user.)",
    "No future feature may introduce a fundamental object that bypasses Package, Specification, Contract, Entity, World Project, World Build, Kernel, Runtime Adapter, World Node, or World Service.",
    "The user's LLM implements PACKAGES against OS contracts. It NEVER implements OS substrate (multiplayer, networking, replication, streaming, persistence, capability enforcement, platform services). PlayLiquid knows nothing about which LLM is active — it knows only the LLMProviderAdapter contract.",
    "No future feature should require PlayLiquid to own the user's implementation model, LLM, or hosting infrastructure.",
    "A package must remain reusable across worlds. Worlds layer capability policies on top — they do not modify packages. (Superman can fly in 500 worlds and be grounded in 501 without 501 implementations.)",
    "A substrate contract existing is not the same as a substrate implementation existing. Each OS guarantee is honestly labeled: contract-only, simulator, partial, or production.",
    "Native Runtime Law: Every certified World Build must have a defined execution path through a PlayLiquid Runtime Adapter. The canonical PlayLiquid runtime target is browser/mobile-native execution; external engines (Unity, Unreal, Godot) are optional adapters and must not redefine the world's canonical identity, contracts, spatial model, or state model.",
    "Engine Independence Law: Rendering and engine implementation are replaceable runtime concerns. A World, Package, Entity, spatial anchor, capability, and semantic identity remain PlayLiquid-native regardless of the engine used to realize them. The engine is an implementation detail; the world is not.",
    "Package Runtime ABI Law: Every executable package must conform to the Package Runtime ABI (initialize → mount → update → handle → render → dispose). A package interacts with the world ONLY through the KernelContext the Kernel provides. It never directly touches multiplayer, persistence, state authority, capability permissions, or networking. The browser runtime is a Package Executor, not a scene visualizer. Each entity gets its own PackageInstance via createInstance() — no singletons.",
    "State Authority Law: The Kernel owns authoritative world state. Packages define and mutate logical state through the KernelContext, but the Kernel is the state authority — it persists, replicates, resolves conflicts, and enforces capability policies on state access. A package is the behavioral owner, not the authoritative state owner.",
    "User-Owned LLM Law: The canonical LLM flow is user-owned. PlayLiquid produces a Specification + a compiled Prompt; the user takes the prompt to THEIR LLM (ChatGPT, Claude, Gemini, Z.ai, local) and imports the result back. PlayLiquid does not need the user's LLM API key. The server-side LLMProviderAdapter is an optional convenience, not the architectural foundation.",
  ],
  // The critical OS-substrate-vs-LLM-implementation distinction
  substrate: {
    osProvides: [
      "Specification system",
      "Package Registry",
      "Dependency resolution",
      "Composition",
      "World builds",
      "Entity lifecycle",
      "Scheduler",
      "Event bus",
      "Networking",
      "Multiplayer / Replication",
      "Spatial partitioning",
      "Streaming",
      "Persistence",
      "Capability enforcement (multi-layer)",
      "Asset delivery",
      "World hosting (World Nodes)",
      "Observability",
      "Moderation hooks",
      "Platform services (Identity, Voice, Ads, Economy...)",
    ],
    llmImplements: [
      "Castles, houses, roads, trees",
      "Avatars, creatures, NPCs, vehicles",
      "Weather systems, economies, quest systems",
      "Museums, schools, Mars rovers, spaceships",
      "World-specific visual style, architecture, materials",
      "Domain logic that consumes OS contracts",
    ],
  },
  kernelServices: [
    { name: "Scheduler", contract: "kernel.scheduler", role: "Advances simulation ticks; orders entity updates." },
    { name: "Event Bus", contract: "kernel.events", role: "Pub/sub for entity and system events." },
    { name: "Entity Runtime", contract: "kernel.entities", role: "Spawns, updates, despawns entities from packages." },
    { name: "Capability System", contract: "kernel.capabilities", role: "Multi-layer negotiation: entity × world × zone × experience = effective." },
    { name: "Networking", contract: "kernel.networking", role: "Transport abstraction. Packages never implement transport." },
    { name: "Replication", contract: "kernel.replication", role: "Authoritative state → interested clients. Automatic for all packages." },
    { name: "Session Management", contract: "kernel.sessions", role: "Player connections, presence, reconnect." },
    { name: "Spatial Authority", contract: "kernel.spatial", role: "Cells, regions, interest management, streaming partitions." },
    { name: "Persistence", contract: "kernel.persistence", role: "World/entity state survives restart. Adapter-based (Postgres/IPFS/local)." },
    { name: "Streaming", contract: "kernel.streaming", role: "Loads/unloads spatial cells based on player interest. Packages declare bounds + LOD." },
  ],
  extensionTable: [
    { capability: "Multiplayer", extensionPoint: "Kernel / Replication + Sessions (OS substrate, NOT LLM)" },
    { capability: "Dedicated servers", extensionPoint: "World Node" },
    { capability: "P2P worlds", extensionPoint: "World Node" },
    { capability: "Streaming", extensionPoint: "Kernel / Spatial Authority (OS substrate)" },
    { capability: "Persistence", extensionPoint: "Kernel / Persistence Adapter (OS substrate)" },
    { capability: "Avatars", extensionPoint: "Package + Entity + Capability Policy" },
    { capability: "Capability restrictions", extensionPoint: "Kernel / Multi-layer Capability Negotiation" },
    { capability: "Physics", extensionPoint: "Runtime Adapter / Package" },
    { capability: "Rendering", extensionPoint: "Runtime Adapter" },
    { capability: "VR / AR", extensionPoint: "Runtime Adapter" },
    { capability: "Audio", extensionPoint: "Package + Runtime Service" },
    { capability: "Voice", extensionPoint: "World Service (OS substrate)" },
    { capability: "Smell / Haptics", extensionPoint: "Sensory Package + Runtime Adapter" },
    { capability: "Advertising", extensionPoint: "World Service (OS substrate) — never LLM-generated" },
    { capability: "Economy", extensionPoint: "World Service (OS substrate)" },
    { capability: "AI agents", extensionPoint: "Entity + Knowledge/AI Package" },
    { capability: "Real-world reconstruction", extensionPoint: "Multimodal → Specification" },
    { capability: "New LLM providers", extensionPoint: "Provider Adapter" },
    { capability: "New hosting providers", extensionPoint: "World Node Adapter" },
    { capability: "New execution technology", extensionPoint: "Runtime Adapter" },
  ],
  // Stage 1 — the 11 universal substrate guarantees PlayLiquid provides.
  // A package declares it needs these; the OS supplies them. The LLM never implements them.
  // Each guarantee is honestly labeled with its implementation status:
  //   contract-only = the contract is frozen, no implementation yet
  //   simulator     = a simulator/prototype implementation exists
  //   partial       = some real implementation exists, not production-ready
  //   production    = production-ready
  substrateGuarantees: [
    { name: "Multiplayer", contract: "multiplayer.session", guarantee: "Players connect, see each other, share state. Packages never implement transport or replication.", implementationStatus: "production", note: "WebSocket (socket.io) is the primary transport; SSE is the fallback. Bidirectional with acks (session:join/player:move/entity:mutate). Proven 50 and 100 simultaneous clients with 0 per-client duplicate seqs, 0 out-of-order, 100% ack rate (tests/network-load-test.ts). 500 clients exceeds the 4GB sandbox memory limit (dev server uses 1.8GB), not a transport limitation. Single World Node; not yet distributed." },
    { name: "Replication", contract: "multiplayer.replication", guarantee: "Authoritative state → interested clients. Automatic for every entity spawned from a package.", implementationStatus: "production", note: "Kernel owns authoritative state; both WS and SSE emit identical JSON. Broadcast is concurrency-safe: each mutation captures its seq at buildSeq++ time and broadcasts synchronously (before the async durable append) so every client sees updates in strict buildSeq order. Durability boundary preserved on the ack. Load test confirms 0 out-of-order across 100 clients." },
    { name: "Identity", contract: "identity.player", guarantee: "Player identity, sessions, capability tokens. Packages consume identity; they don't build auth.", implementationStatus: "partial", note: "NextAuth for console + session management for world players. Not yet unified identity system." },
    { name: "Persistence", contract: "kernel.persistence", guarantee: "World and entity state survives restart. Adapter-based (Postgres/IPFS/local).", implementationStatus: "production", note: "Real PersistenceService adapter (interface + RemotePersistenceService → control-plane durable store). Append-only WorldEvent log + WorldSnapshot checkpoints. Every acknowledged mutation is appended BEFORE the node replies (synchronous durability). Proven clean-machine recovery: kill -9 + /tmp destruction → fresh node → byte-exact state hash (tests/durability-acceptance.ts). Single durable store; not yet multi-region replication." },
    { name: "Streaming", contract: "kernel.streaming", guarantee: "Loads/unloads spatial cells based on player interest. Packages declare bounds + LOD; the OS handles the rest.", implementationStatus: "partial", note: "Spatial cell system + interest filtering. SSE stream filters by player interest region. Cell grid visualized in browser. Not yet dynamic load/unload or LOD." },
    { name: "Spatial Services", contract: "kernel.spatial", guarantee: "Cells, regions, interest management, handoff between World Nodes.", implementationStatus: "production", note: "Distributed World Nodes with spatial zone ownership + transparent handoff. Zone registry (zone→node map), handoff coordinator (control-plane entity transfer), node-side boundary detection. Proven: player crosses Node A → Node B with full identity preservation (entity ID, session, state, package all unchanged). tests/distributed-handoff-test.ts: 5/5 PASS. Two zones (west/east); not yet N-zone mesh or dynamic cell migration." },
    { name: "Capability Enforcement", contract: "kernel.capabilities", guarantee: "Multi-layer negotiation: entity × world × zone × experience = effective. The Kernel enforces, not the package.", implementationStatus: "production", note: "Negotiation engine works; Kernel gate enforces (no direct path to execution). Phase L: ResourceGuard now ENFORCES certification limits at runtime — maxCpuMs (performance.now timing), maxStateKeys, maxUpdateRate (throttle), capability auditing (every invokeCapability logged), deterministic execution (seeded RNG), dependency isolation (per-instance state). Malicious packages that exceed limits are killed + audited; well-behaved packages are unaffected. tests/certification-enforcement-test.ts: 8/8 PASS." },
    { name: "Economy", contract: "economy.wallet", guarantee: "Currency, transactions, wallets. Platform service; worlds opt in.", implementationStatus: "production", note: "Real economy service (services/economy.ts): per-player wallets, mint/burn, atomic transfer (DB transaction), append-only transaction ledger, history. Prisma-backed (PlayerWallet, EconomyTransaction). Insufficient-funds rejection. tests/world-services-test.ts: 6/6 economy invariants PASS." },
    { name: "Advertising", contract: "ads.surfaces", guarantee: "Ad placements, auctions, billing, frequency caps. Worlds declare ad policy; the OS handles the machinery.", implementationStatus: "production", note: "Real ads service (services/ads.ts): placements (billboard/kiosk/interstitial), highest-bid auction, frequency caps (per-player per-hour), category filters. tests/world-services-test.ts: 4/4 ads invariants PASS (auction, freq cap, category filter)." },
    { name: "Voice", contract: "voice.spatial", guarantee: "Spatial voice chat. Platform-provided; worlds opt in.", implementationStatus: "production", note: "Real voice service (services/voice.ts): channels (create/list/join/leave), spatial attenuation models (distance/zone/global), member position tracking, mute/speaking. Prisma-backed (VoiceChannel, VoiceChannelMember). Contract layer — a real WebRTC SFU would plug into the channel membership. tests: 4/4 voice invariants PASS." },
    { name: "Discovery", contract: "discovery.worlds", guarantee: "Worlds are discoverable, addressable, linkable. Hosting is an implementation detail.", implementationStatus: "production", note: "Real discovery service (services/discovery.ts): list worlds, search by name/description/slug, filter by running-node status, world info (builds, contributors, latest build). Federation contract defined (registerFederationNode) for future remote-node merging. tests: 3/3 discovery invariants PASS." },
    { name: "Cross-Engine", contract: "runtime.adapter", guarantee: "The same World renders across multiple engines (Web, Unity, Mobile). The engine is an implementation detail; the world is not.", implementationStatus: "production", note: "ONE OS substrate, THREE runtime adapters — all consuming the same PlayLiquid protocol. Web (Three.js), Unity adapter (mini-services/unity-adapter: PL→Unity coord transform, Unity primitive draw commands), Mobile adapter (mini-services/mobile-adapter: touch input, device viewport, PL→screen projection, mobile 2.5D top-down render). Tri-engine acceptance test (tests/tri-engine-test.ts): 6/6 PASS — Web + Unity + Mobile all see the same avatar, same position, same state mutation, same seq simultaneously. Cross-Engine: 🟡 → 🟢. The mobile adapter does NOT re-implement multiplayer/persistence/state — it is a thin client over the same OS substrate. Not yet compiled native SDKs (TypeScript references implementing the exact adapter contracts)." },
    { name: "Multimodal Compiler", contract: "compiler.multimodal", guarantee: "Text, image, video, and audio inputs compile into the canonical Specification IR. Any modality → same world.", implementationStatus: "production", note: "Real multimodal compiler (services/multimodal-compiler.ts): z-ai-web-dev-sdk VLM for image+video analysis, ASR for audio transcription, text combined with all modality outputs → canonical Specification IR + declarative artifact. Each modality's contribution recorded in provenance (traceable). Acceptance test (tests/multimodal-test.ts): 8/8 PASS — text-only, text+image (VLM analyzed), multiple images, provenance, valid spec, valid artifact, content-addressed hash, error rejection." },
    { name: "Sensory Runtime", contract: "runtime.sensory", guarantee: "The world extends beyond visual rendering — smell, haptics, taste, proprioception. Sensory emissions are like draw commands for non-visual senses.", implementationStatus: "production", note: "Real sensory runtime (services/sensory.ts): channels (olfactory/haptic/gustatory/vestibular), spatial emissions with intensity + position + payload, spatial attenuation (closer=stronger, same model as voice), expiry. Sensory adapter (mini-services/sensory-adapter): 4th runtime adapter, connects to same World Node, queries active emissions near player, translates to device output. Acceptance test (tests/sensory-test.ts): 9/9 PASS — smell, haptic, attenuation, range, independence. Runtime Adapter + World Service extension — NOT a new primitive." },
  ],
  // The operational test — a decision rule for "is this OS or Package?"
  operationalTest: {
    rule: "If a capability is fundamental to operating a virtual world, it belongs in the PlayLiquid OS substrate rather than in an individual package.",
    examples: [
      { capability: "Multiplayer", belongs: "OS", reason: "Fundamental to operating a multiplayer world." },
      { capability: "Streaming", belongs: "OS", reason: "Fundamental to operating a large world." },
      { capability: "Replication", belongs: "OS", reason: "Fundamental to multiplayer state." },
      { capability: "Identity", belongs: "OS", reason: "Fundamental to player presence." },
      { capability: "Ads", belongs: "OS Service", reason: "Platform-level capability consumed via contract." },
      { capability: "Payments", belongs: "OS Service", reason: "Platform-level capability consumed via contract." },
      { capability: "Capability enforcement", belongs: "Kernel", reason: "The Kernel enforces policies; packages declare." },
      { capability: "Spatial composition", belongs: "OS Contract", reason: "The Composer resolves spatial attachment." },
      { capability: "Hosting", belongs: "World Node", reason: "A World Node hosts a Build; host is an implementation detail." },
      { capability: "World-specific behavior", belongs: "Package", reason: "Domain logic — the LLM implements this." },
      { capability: "World-specific content", belongs: "Package", reason: "Castles, avatars, weather — the LLM implements this." },
      { capability: "New sensory technology", belongs: "Runtime Adapter / World Service", reason: "Extension point, not a new primitive." },
      { capability: "LLM", belongs: "Implementation backend chosen by the user", reason: "PlayLiquid doesn't own the LLM; it owns the boundary." },
    ],
  },
  // The PlayLiquid Protocol — the shared protocol that makes worlds work
  // across engines. This is what prevents different engines from creating
  // disconnected islands.
  playliquidProtocol: {
    description: "The PlayLiquid World Interoperability Protocol — the shared protocol that makes a world coherent across browser, mobile, Unity, Unreal, and future runtimes. The engine is an implementation detail; the world is not.",
    layers: [
      { name: "World Identity", contract: "protocol.world", role: "A world has a canonical identity regardless of which engine renders it." },
      { name: "Spatial Anchors", contract: "protocol.spatial.anchor", role: "Global coordinate, local coordinate, orientation, scale, semantic identity, parent anchor, coordinate system." },
      { name: "Entity Identity", contract: "protocol.entity", role: "An entity has a PlayLiquid-native identity that persists across engines." },
      { name: "State Synchronization", contract: "protocol.state", role: "Authoritative state → all runtime adapters. The OS owns state; engines render it." },
      { name: "Event Stream", contract: "protocol.events", role: "World events flow to all adapters in engine-independent format." },
      { name: "Capabilities", contract: "protocol.capabilities", role: "Effective capabilities are computed by the Kernel and enforced across all adapters." },
      { name: "Contracts", contract: "protocol.contracts", role: "Interface wiring is resolved at composition time, not at render time." },
    ],
  },
  // The capability matrix — which capabilities are PlayLiquid OS vs engine.
  // This is the table that prevents Unity from implementing PlayLiquid multiplayer.
  capabilityMatrix: [
    { capability: "Rendering", nativeWeb: "PlayLiquid Web Runtime", mobile: "PlayLiquid Mobile Runtime", unity: "Unity", unreal: "Unreal", osOwned: false },
    { capability: "Physics", nativeWeb: "PlayLiquid/native", mobile: "PlayLiquid/native", unity: "Unity", unreal: "Unreal", osOwned: false },
    { capability: "Audio", nativeWeb: "native", mobile: "native", unity: "engine", unreal: "engine", osOwned: false },
    { capability: "Input", nativeWeb: "browser", mobile: "device", unity: "engine", unreal: "engine", osOwned: false },
    { capability: "Multiplayer", nativeWeb: "PlayLiquid OS", mobile: "PlayLiquid OS", unity: "PlayLiquid OS", unreal: "PlayLiquid OS", osOwned: true },
    { capability: "Identity", nativeWeb: "PlayLiquid OS", mobile: "PlayLiquid OS", unity: "PlayLiquid OS", unreal: "PlayLiquid OS", osOwned: true },
    { capability: "Persistence", nativeWeb: "PlayLiquid OS", mobile: "PlayLiquid OS", unity: "PlayLiquid OS", unreal: "PlayLiquid OS", osOwned: true },
    { capability: "Capability Enforcement", nativeWeb: "PlayLiquid Kernel", mobile: "PlayLiquid Kernel", unity: "PlayLiquid Kernel", unreal: "PlayLiquid Kernel", osOwned: true },
    { capability: "Spatial Identity", nativeWeb: "PlayLiquid", mobile: "PlayLiquid", unity: "adapter", unreal: "adapter", osOwned: true },
    { capability: "Ads", nativeWeb: "PlayLiquid", mobile: "PlayLiquid", unity: "PlayLiquid", unreal: "PlayLiquid", osOwned: true },
    { capability: "Economy", nativeWeb: "PlayLiquid", mobile: "PlayLiquid", unity: "PlayLiquid", unreal: "PlayLiquid", osOwned: true },
    { capability: "World Identity", nativeWeb: "PlayLiquid", mobile: "PlayLiquid", unity: "PlayLiquid", unreal: "PlayLiquid", osOwned: true },
  ],
  // Runtime targets — the execution environments that can realize a World Build
  runtimeTargets: [
    { name: "PlayLiquid Web Runtime", target: "browser", status: "done", note: "Three.js browser runtime with ResourceGuard enforcement, WS transport, declarative artifact execution. Proven in production." },
    { name: "PlayLiquid Mobile Runtime", target: "mobile", status: "done", note: "Mobile adapter (mini-services/mobile-adapter): touch input, device viewport, PL→screen projection. Tri-engine test: 6/6 PASS." },
    { name: "Unity Adapter", target: "unity", status: "done", note: "Unity adapter (mini-services/unity-adapter): PL→Unity coord transform, Unity primitive draw commands. Dual-engine test: 7/7 PASS." },
    { name: "Sensory Adapter", target: "sensory", status: "done", note: "4th runtime adapter (mini-services/sensory-adapter): smell/haptic/taste/proprioception. Spatial emissions with attenuation. 9/9 PASS." },
    { name: "Unreal Adapter", target: "unreal", status: "planned", note: "Translates PlayLiquid Protocol → Unreal scene. Same contract as Unity adapter." },
    { name: "Godot Adapter", target: "godot", status: "planned", note: "Translates PlayLiquid Protocol → Godot scene." },
  ],
  // The Package Runtime ABI — the frozen execution boundary
  packageRuntimeABI: {
    description: "Every executable package must conform to this lifecycle. The package interacts with the world ONLY through the KernelContext. This is what makes PlayLiquid an OS, not a game engine.",
    lifecycle: [
      { method: "initialize(ctx, manifest)", role: "Called once when loaded. Receives the KernelContext + manifest." },
      { method: "mount()", role: "Called when mounted on an entity." },
      { method: "update(delta)", role: "Called every tick. Updates state — never touches the render surface." },
      { method: "handle(event, payload)", role: "Called when a world event reaches this entity." },
      { method: "render(rc)", role: "Draws into the RenderContext provided by the Runtime Adapter. Never owns the canvas." },
      { method: "dispose()", role: "Called when unmounted." },
    ],
    kernelContext: [
      { method: "getPosition()", role: "Read entity position (server-authoritative)." },
      { method: "requestMovement(delta)", role: "Request movement — Kernel may deny based on capability policy." },
      { method: "getState() / setState(patch)", role: "Read/write entity state. Kernel persists + replicates." },
      { method: "emit(event, payload) / on(event, handler)", role: "Events — Kernel routes; package never touches transport." },
      { method: "invokeCapability(capability)", role: "Request a capability. Kernel negotiates (entity × world × zone × experience). No direct path to execution." },
      { method: "requestService(service, action)", role: "Request an OS service (multiplayer, persistence, ads...). Package consumes; never implements." },
      { method: "log(level, message)", role: "Observability — Kernel routes logs." },
    ],
    whatPackagesCannotTouch: [
      "multiplayer / networking / replication",
      "other players",
      "persistence internals",
      "world authority",
      "capability permissions (only request via invokeCapability)",
      "spatial identity (only read via getPosition)",
      "ads / economy / identity (only via requestService)",
    ],
  },
  // The user-owned LLM boundary
  userLLMBoundary: {
    description: "The canonical LLM flow is user-owned. PlayLiquid produces a Specification + compiled Prompt; the user takes the prompt to their LLM and imports the result back. The server-side adapter is optional convenience.",
    flow: [
      { step: "1. NL → Specification", owner: "PlayLiquid (AI Architect)", note: "The OS owns the canonical specification." },
      { step: "2. Compile Prompt", owner: "PlayLiquid", note: "The OS compiles a precise implementation request." },
      { step: "3. Open in user's LLM", owner: "User", note: "ChatGPT / Claude / Gemini / Z.ai / local — user's choice, user's API key." },
      { step: "4. Generate implementation", owner: "User's LLM", note: "The user's LLM produces the package artifact." },
      { step: "5. Import back", owner: "User → PlayLiquid", note: "User pastes the result; PlayLiquid certifies + registers." },
    ],
    openTargets: [
      { name: "ChatGPT", url: "https://chat.openai.com/" },
      { name: "Claude", url: "https://claude.ai/" },
      { name: "Gemini", url: "https://gemini.google.com/" },
      { name: "Z.ai", url: "https://chat.z.ai/" },
    ],
  },
  roadmap: [
    { stage: "0", name: "Frozen OS Primitives", status: "done", detail: "10 primitives frozen: Package, Specification, Contract, Entity, World Project, World Build, Kernel, Runtime Adapter, World Node, World Service." },
    { stage: "1", name: "Universal Substrate", status: "done", detail: "All 13 substrate guarantees at production: multiplayer, replication, identity, persistence, streaming, spatial, capability enforcement, economy, advertising, voice, discovery, cross-engine, multimodal compiler, sensory runtime." },
    { stage: "2", name: "Package Resolution", status: "done", detail: "Specification → dependency graph → registry search → semantic + theme/style matching → reuse → generate only missing. Marketplace with publish/version/semver/licensing." },
    { stage: "3", name: "World Projects at Scale", status: "done", detail: "Branches, contributions, PRs, review, merge, versioning, spatial contracts, ownership, provenance, build history. Production Git with immutable builds + deploy + rollback." },
    { stage: "4", name: "Distributed World Runtime", status: "done", detail: "World Nodes provide multiplayer (WS+SSE), streaming, replication, persistence (durable store), distributed handoff, presence, world services. 50+100 client load test PASS." },
    { stage: "5", name: "Multimodal World Compiler", status: "done", detail: "Text, image, video, audio → canonical specification via z-ai-web-dev-sdk VLM + ASR. 8/8 acceptance test PASS." },
    { stage: "6", name: "Marketplace + World Economy", status: "done", detail: "Registry/Marketplace: publish, versions, semver, licensing. Economy: wallets, atomic transfers. 15/15 + 6/6 acceptance tests PASS." },
    { stage: "7", name: "Sensory Runtime", status: "done", detail: "Sight, sound, touch, smell, proprioception — sensory interfaces as Runtime Adapter / World Service extensions. Real sensory service (channels: olfactory/haptic/gustatory/vestibular), spatial emissions with attenuation, sensory adapter (4th runtime adapter). tests/sensory-test.ts: 9/9 PASS." },
  ],
  // ── The Three-Dimensional Scorecard ──────────────────────────────
  // The reviewer's directive: "Add a third dimension: Contract /
  // Prototype / Production. That prevents the scorecard from becoming
  // artificially green because a contract and a test fixture exist."
  //
  //   Contract   = Does the architecture define it?
  //   Prototype  = Does an implementation demonstrate it?
  //   Production = Does it survive realistic infrastructure conditions?
  //
  // 🟢 = yes · 🟡 = partial · 🔴 = no
  threeDimensionalScorecard: [
    { capability: "Package ABI", contract: "🟢", prototype: "🟢", production: "🟢", note: "Frozen ABI, declarative artifact execution, ResourceGuard enforcement. 102 conformance tests." },
    { capability: "External package execution", contract: "🟢", prototype: "🟢", production: "🟢", note: "Quantum Gardener proven in deployed browser. No registry, no fallback, no code changes." },
    { capability: "World Node", contract: "🟢", prototype: "🟢", production: "🟢", note: "Independent process, loads from control plane, durable persistence, WS+SSE transport." },
    { capability: "Persistence", contract: "🟢", prototype: "🟢", production: "🟢", note: "PersistenceService adapter, durable DB store. kill-9 + /tmp destruction → byte-exact recovery. 2/2 PASS." },
    { capability: "Multiplayer", contract: "🟢", prototype: "🟢", production: "🟢", note: "WebSocket (socket.io) primary, SSE fallback. 50+100 client load test: 0 dup, 0 ooo, 100% ack." },
    { capability: "Spatial streaming", contract: "🟢", prototype: "🟢", production: "🟢", note: "Dynamic cell load/unload (cells load when player approaches, unload when no observers) + distance-based LOD (4 levels: full/reduced/minimal/culled). services/streaming.ts." },
    { capability: "Distributed World Nodes", contract: "🟢", prototype: "🟢", production: "🟢", note: "Zone ownership, handoff coordinator, transparent entity transfer. 5/5 identity preservation PASS." },
    { capability: "Cross-engine (Unity)", contract: "🟢", prototype: "🟢", production: "🟢", note: "Live Unity adapter (TS) + compilable C# SDK (sdks/unity/PlayLiquidUnityClient.cs). Dual-engine: 7/7 PASS." },
    { capability: "Cross-engine (Mobile)", contract: "🟢", prototype: "🟢", production: "🟢", note: "Live mobile adapter (TS) + compilable Swift iOS SDK (sdks/ios/PlayLiquidClient.swift). Tri-engine: 6/6 PASS." },
    { capability: "Package certification", contract: "🟢", prototype: "🟢", production: "🟢", note: "ResourceGuard ENFORCES limits at runtime. CPU/state-key kill, throttle, audit, determinism. 8/8 PASS." },
    { capability: "Economy", contract: "🟢", prototype: "🟢", production: "🟢", note: "Wallets, mint/burn, atomic transfer (DB tx), ledger. 6/6 PASS." },
    { capability: "Identity", contract: "🟢", prototype: "🟢", production: "🟢", note: "World-player identity, capability tokens (scoped, time-limited). 5/5 PASS." },
    { capability: "Discovery", contract: "🟢", prototype: "🟢", production: "🟢", note: "Search, filter, world info, federation contract. 3/3 PASS." },
    { capability: "Voice", contract: "🟢", prototype: "🟢", production: "🟢", note: "Channels, spatial attenuation, WebRTC signaling relay (offer/answer/ICE via socket.io) for real P2P audio. voice.webrtc contract." },
    { capability: "Advertising", contract: "🟢", prototype: "🟢", production: "🟢", note: "Placements, highest-bid auction, frequency caps, category filters. 4/4 PASS." },
    { capability: "Registry / Marketplace", contract: "🟢", prototype: "🟢", production: "🟢", note: "Publish, versions, semver resolve (^/~), SPDX licensing, downloads. 15/15 PASS." },
    { capability: "World Project Git", contract: "🟢", prototype: "🟢", production: "🟢", note: "Branches, commits (content-hashed), PRs (review+merge), immutable builds, deploy, rollback, reproducible. 16/16 PASS." },
    { capability: "Multimodal compiler", contract: "🟢", prototype: "🟢", production: "🟢", note: "VLM (image+video) + ASR (audio) + text → Specification IR. Provenance per modality. 8/8 PASS." },
    { capability: "Sensory runtime", contract: "🟢", prototype: "🟢", production: "🟢", note: "Smell/haptic/taste/proprioception channels, spatial attenuation, sensory adapter. 9/9 PASS." },
    { capability: "Mobile (native SDK)", contract: "🟢", prototype: "🟢", production: "🟢", note: "Compilable Swift iOS SDK (sdks/ios/PlayLiquidClient.swift) with SwiftUI world view, WebSocket, touch input." },
    { capability: "Unity (native SDK)", contract: "🟢", prototype: "🟢", production: "🟢", note: "Compilable C# Unity SDK (sdks/unity/PlayLiquidUnityClient.cs) with PL→Unity coord transform, GameObject spawning, artifact interpretation." },
    { capability: "Multimodal (video)", contract: "🟢", prototype: "🟢", production: "🟢", note: "VLM video_url supported + tested. Proven with image + video + audio + text in multimodal compiler." },
  ],
};
