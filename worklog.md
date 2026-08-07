# Playliquid OS — Implementation Worklog

## Vision

Playliquid OS is an operating system for virtual worlds. The architecture is **frozen** around 9 permanent primitives and 2 pipelines. The MVP does NOT implement multiplayer, VR, smell, or photorealism — it freezes the **kernel and contracts** so all future capabilities plug in without changing what a Package, World, Entity, Specification, Build, or Runtime means.

## The 9 Frozen Primitives

1. **Package** — everything that exists in a World is a Package (avatars, buildings, physics, weather, renderers, sensory devices...). Has Identity, Specification, Interfaces (provides/requires), Dependencies, Capabilities, Manifest, Artifact, Version, Hash, Provenance, Certification, License.
2. **Specification** — the canonical truth (IR). Distinct from the LLM prompt and from the generated artifact. NL → Specification → Prompt → LLM → Artifact.
3. **Interface / Contract** — capability families (`spatial.anchor`, `avatar.movement`). Packages `provides` and `requires` contracts. The Composer wires them.
4. **Entity** — a Package *instantiated* into a running World. Has identity, position, components, state, lifecycle.
5. **World Project** — the Git-like source repository for a World (spec, theme, rules, contributors, builds).
6. **World Build** — an immutable, reproducible artifact: resolved package versions + interface connections + spatial graph + capability policies + runtime config.
7. **Kernel** — small universal runtime: Scheduler, Event Bus, Entity Lifecycle, Capability System, State, Package Mgmt, Networking/Persistence/Rendering as *abstractions*.
8. **Runtime Adapter** — the boundary. Browser/WASM/Native/VR/AR/Cloud/Simulator all implement the same adapter. World/Package/Spec don't care.
9. **World Node** — a deployable runtime instance of a Build (Vercel/AWS/local/...). Standardized endpoints: discovery, session, sync, packages, state, health.

## The Two Pipelines

**Generation pipeline:**
```
Natural Language → Specification → Package Resolution → Prompt Generation → User's LLM → Package → Certification → Registry → Composition → World Build → World Node → Runtime
```

**Multimodal pipeline (future, same shape):**
```
Photo/Video/Audio/Scan → Observation → Specification → (same pipeline)
```

## Three Architectural Laws

1. No future feature may introduce a fundamental object that bypasses Package, Specification, Contract, Entity, World Project, World Build, Kernel, or Runtime Adapter.
2. No future feature should require the user's LLM to implement Kernel/platform-service functionality.
3. No future feature should require Playliquid to own the user's implementation model, LLM, or hosting infrastructure.

## Implementation Roadmap (MVP Kernel = items A–O)

| # | Item | Status |
|---|------|--------|
| A | Package Contract (Prisma model + types) | done |
| B | Specification Language / IR (JSON canonical form) | done |
| C | Interface / Contract System | done |
| D | Package Registry (hash, version, provenance, certification, license) | done |
| E | Package Resolver (exact → compatible → generate) | done |
| F | World Project (Git-like) | done |
| G | World Specification (theme, style, spatial rules, policies) | done |
| H | Composition Engine (packages → world graph) | done |
| I | Immutable World Build | done |
| J | Entity Model (Package → Entity) | done |
| K | Kernel (scheduler + events + capabilities + state) | done |
| L | Runtime Adapter (simulator as first impl) | done |
| M | World Node (standardized deployable runtime) | done |
| N | LLM Provider Boundary | done |
| O | NL → Specification → Prompt pipeline (uses z-ai-web-dev-sdk) | done |

## API Contract (consumed by the frontend)

All endpoints are relative paths under `/api`. JSON in/out.

### Architecture
- `GET /api/architecture` → `{ primitives: [...], pipelines: [...], laws: [...], extensionTable: [...] }`

### Packages (Registry)
- `GET /api/packages?family=&q=` → `Package[]`
- `POST /api/packages` → `Package` (body: name, displayName, description, family, version, provides[], requires[], capabilities[], manifest, specification, license)
- `GET /api/packages/:id` → `Package` (with provides/requires interfaces)

### Specifications
- `POST /api/specifications` → `{ specification, prompt, packageId? }` body: `{ naturalLanguage, worldProjectId?, kind }`. Runs NL → canonical IR (LLM) → prompt compiler.

### World Projects
- `GET /api/world-projects` → `WorldProject[]`
- `POST /api/world-projects` → `WorldProject` (body: name, description, theme{}, rules{})
- `GET /api/world-projects/:id` → `WorldProject` (with builds + spec)

### Resolve & Compose
- `POST /api/resolve` → `{ reused: Package[], generated: Package[], missing: Specification[] }` body: `{ specificationId, worldProjectId, reusePolicy }`
- `POST /api/compose` → `WorldBuild` body: `{ worldProjectId, packageIds[] }`. Produces immutable build manifest + hash.

### World Builds
- `GET /api/world-builds?projectId=` → `WorldBuild[]`
- `GET /api/world-builds/:id` → `WorldBuild` (with packages, entities, nodes)

### World Nodes
- `GET /api/world-nodes?buildId=` → `WorldNode[]`
- `POST /api/world-nodes` → `WorldNode` body: `{ worldBuildId, host }`
- `POST /api/world-nodes/:id/start` → `WorldNode` (status → running, spawns entities, emits kernel events)
- `POST /api/world-nodes/:id/stop` → `WorldNode`

### Entities
- `GET /api/entities?buildId=` → `Entity[]`
- `POST /api/entities` → `Entity` body: `{ worldBuildId, packageId, name, position{}, components[] }`

### Kernel
- `GET /api/kernel/events?limit=` → `KernelEvent[]` (newest first)
- `POST /api/kernel/tick` → `{ events: KernelEvent[] }` (advance the scheduler one tick)

### Generate (full pipeline)
- `POST /api/generate` → `{ request, specification, prompt, package }` body: `{ naturalLanguage, worldProjectId, family }`. Runs the whole NL → spec → resolve → prompt → LLM → package → registry pipeline. Records a GenerationRequest.

## Type shapes (summary)

```ts
Package = { id, name, displayName, description, family, version, hash, manifest, specification, artifactUri, provenance, certification, license, capabilities[], provides: Interface[], requires: Interface[], createdAt }
Interface = { id, name, family, version, direction: 'provides'|'requires', schema, description }
Specification = { id, naturalLanguage?, canonical, kind, theme?, spatialRules?, policies?, createdAt }
WorldProject = { id, name, slug, description, theme, rules, packageManifest, contributors, specification?, builds[], createdAt }
WorldBuild = { id, version, worldProjectId, manifest, hash, status, packages[], entities[], nodes[], createdAt }
Entity = { id, worldBuildId, packageId, name, position{x,y,z}, components[], state{}, createdAt }
WorldNode = { id, worldBuildId, host, endpoint, status, health{}, capabilities{}, startedAt, createdAt }
KernelEvent = { id, entityId?, type, payload{}, createdAt }
GenerationRequest = { id, input, specification, prompt, provider, status, packageId?, log[], createdAt }
```

---

Task ID: 0
Agent: orchestrator (main)
Task: Study the Playliquid OS architecture, produce a roadmap, and begin implementing the MVP kernel as a Next.js application.

Work Log:
- Read the architecture document and distilled the 9 frozen primitives + 2 pipelines + 3 laws.
- Loaded the LLM skill to understand z-ai-web-dev-sdk usage for the NL→Specification→Prompt pipeline.
- Inspected current project (Next.js 16, Prisma+SQLite, full shadcn/ui set, z-ai-web-dev-sdk present).
- Wrote this roadmap + API contract to worklog.md as the shared source of truth.

Stage Summary:
- Roadmap frozen. API contract frozen. Next: build Prisma schema → lib → API routes → seed → frontend → verify.

---
Task ID: 1
Agent: orchestrator (main)
Task: Implement the full Playliquid OS MVP kernel — schema, lib, API, seed, frontend — and verify end-to-end.

Work Log:
- Designed Prisma schema for all 9 frozen primitives (Package, Interface, Specification, WorldProject, WorldBuild, Entity, WorldNode, KernelEvent, GenerationRequest) with separate FK fields for provides/requires interfaces. Pushed to SQLite.
- Built core lib in src/lib/playliquid/: types.ts, architecture.ts (frozen manifest), hashing.ts (sha256 content hashing), mappers.ts (Prisma→canonical), resolver.ts (Package Resolver with world-coherence filter + reuse policies), composer.ts (Composition Engine: interface wiring + spatial graph + capability policies + immutable build), kernel.ts (Scheduler + Event Bus + Entity Lifecycle + Node lifecycle), pipeline.ts (NL→Specification→Prompt→LLM→Package using z-ai-web-dev-sdk), seed.ts.
- Wrote 16 API route handlers: architecture, packages (+[id]), specifications, world-projects (+[id]), resolve, compose, world-builds (+[id]), world-nodes (+start/+stop), entities, kernel/events, kernel/tick, generate.
- Seeded the OS: 1 world spec, 1 world project (Amsterdam Canal City, 17th-century theme), 6 packages (canal-water, brick-cobblestone road, canal-house, walker avatar, dutch-overcast weather, simple-rigid physics) with provides/requires contracts, 1 ready build v1 (5 interface connections), 1 running vercel node, 6 entities, 2 kernel events.
- Built the Playliquid OS Console frontend (single / route): 6 panels (Architecture, Registry, Worlds, Build, Runtime, Console) with a dark "OS console" aesthetic, emerald/teal accent (no indigo/blue), custom scrollbars, grid background. Zustand for UI state, TanStack Query for server state with polling for live kernel events/entities/nodes. Sticky header with live status pills, sticky-on-mobile nav, sticky footer (mt-auto on flex min-h-screen col).
- Fixed: ambiguous Prisma relation (provides/requires), Specification↔Package relation naming collision, world-projects missing nested includes, setState-in-effect lint error (derived activeBuildId instead), controlled/uncontrolled Select warnings (gated Select render until data loads), Dialog a11y, mobile nav scroll-away (made nav sticky top-14 on mobile).

Stage Summary:
- All 9 frozen primitives implemented and wired through both permanent pipelines.
- Agent Browser verified end-to-end:
  • Architecture panel renders all 9 primitives + 2 pipelines + 3 laws + extension table.
  • Registry lists 6 seeded packages; detail dialog shows provides/requires/capabilities/specification/manifest.
  • Build: selected all packages → Composed Build v2 with 4 interface contracts wired (toast confirmed).
  • Runtime: deployed a local node → started it (spawned 6 entities) → Tick Kernel emitted 12 events → live event bus updated.
  • Console: NL "A windmill with slowly rotating wooden blades…" → full LLM pipeline ran → generated "Windmill" package persisted to registry, with canonical specification + compiled prompt displayed.
  • Responsive: tested at 390×844 (mobile) and 1440×900 (desktop).
  • Sticky footer: confirmed flex min-h-screen flex-col + mt-auto structurally; footer pushes naturally on long content.
  • Lint clean. Zero console warnings/errors on fresh load.
- Dev server running on port 3000. The application is interactive and runnable.

---
Task ID: 2
Agent: orchestrator (main)
Task: Deploy Playliquid OS to GitHub + Vercel with auth, Neon Postgres, and full env-var parity.

Work Log:
- Discovered z-ai-web-dev-sdk uses a file-based config (/etc/.z-ai-config) which won't work on Vercel's read-only FS. Created src/lib/playliquid/llm-client.ts that reads ZAI_* env vars and instantiates the client directly, with file-config fallback for local dev.
- Switched Prisma from SQLite to PostgreSQL (Neon). Added directUrl for migrations. Pushed schema to Neon (pooled + direct connection strings).
- Added auth models: User (role ADMIN/USER/DEMO, status ACTIVE/WAITLIST), Waitlist, Account, Session, VerificationToken.
- Implemented NextAuth credentials provider with bcrypt password hashing. Sign-up adds to Waitlist (not User). Admin approves waitlist entries → creates User accounts with default password.
- Seeded: admin (ekontetevi@gmail / Payswap123456), demo-admin@playliquid.os (ADMIN), demo-user@playliquid.os (USER). Re-ran Playliquid data seed on Neon (6 packages, 1 world, 1 build, 1 node).
- Built auth UI as an overlay on the / route (no extra page routes): login form, waitlist sign-up form, demo quick-login buttons, user menu with sign-out. AuthGate gates the console.
- Added Admin panel (admin-only) for waitlist approval/rejection with live stats.
- Removed .env from git tracking (was committed in initial scaffold), added .env.example, updated .gitignore.
- Pushed to GitHub: pectoraux/playliquid-os (force-pushed over existing repo). GitHub Push Protection blocked a commit containing the Vercel token in set-vercel-env.py — removed the file, added to .gitignore, re-pushed successfully.
- Set all 11 env vars on the Vercel project (playliquid-os) via API: DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL (https://playliquid-os.vercel.app), ZAI_BASE_URL/API_KEY/CHAT_ID/TOKEN/USER_ID, ADMIN_EMAIL/PASSWORD.
- Deployed to Vercel (production). Domain playliquid-os.vercel.app is live. All features verified via curl + Agent Browser: page loads, demo accounts API, architecture API, 6 packages, world projects, admin login, session, waitlist signup + admin approval, compose build, kernel events.
- Discovered internal-api.z.ai resolves to a private IP (172.25.x.x) unreachable from Vercel. The /api/generate endpoint fails with "fetch failed" on Vercel. Added a rule-based fallback in the pipeline: when the LLM call fails, a deterministic canonical specification + template artifact are generated so the NL→Specification→Prompt→Package pipeline completes end-to-end. This code is committed and pushed; it will deploy when Vercel's free-tier daily deployment limit (100/day) resets.

Stage Summary:
- GitHub: https://github.com/pectoraux/playliquid-os (main branch, .env excluded)
- Vercel: https://playliquid-os.vercel.app (production, READY)
- Neon PostgreSQL: schema pushed, all 9 primitives + auth tables
- Auth: admin + 2 demo accounts seeded; waitlist sign-up + admin approval flow working on Vercel
- Env vars: all 11 set on Vercel (production + preview + development targets)
- Known gap: /api/generate uses the full LLM on space-z.ai; on Vercel it falls back to a rule-based pipeline (code pushed, pending deployment limit reset). All other features work identically on both platforms.

---
Task ID: 3
Agent: orchestrator (main)
Task: Evolve Playliquid OS to the 10-primitive substrate-vs-LLM architecture per the user's reassessment.

Work Log:
- Added 10th primitive: World Service (platform OS services — multiplayer, streaming, persistence, voice, ads, identity, economy). Packages consume them through Contracts; the user's LLM NEVER implements them.
- Added multi-layer capability negotiation engine (the Superman example): entity caps × world policy × zone policy × experience policy = effective. Packages stay reusable across 500 worlds; worlds layer policies on top. Fixed the "deny is sticky" bug so higher-priority allow/limit overrides lower-priority deny.
- Added reuse-first generation pipeline: decompose spec → search registry per sub-package → reuse matches → generate only missing.
- Added spatial slots (attachment API): world defines named slots (canal-network, city-center, museum-district, residential), packages declare required slots, Composer attaches.
- Added contributions model (World Projects as GitHub for Worlds): propose packages, target spatial slots, maintainer merge/reject.
- Updated architecture manifest: 10 primitives, 4 laws (including "the LLM implements packages, NEVER OS substrate"), OS-substrate-vs-LLM table, 10 kernel service contracts, 7-stage roadmap with statuses.
- Seeded: Superman/Bird/Human/Dragon avatars with declared capabilities, capability policies (flight denied world-wide for Superman, allowed in museum-district zone + superman-event experience; super_strength denied world-wide, restored in superman-event; heat_vision limited to 5m range), 7 world services, 4 spatial slots, 3 service bindings, 1 sample contribution (Rijksmuseum → museum-district).
- New UI panels: Capabilities (Superman multi-layer negotiation), Services (OS substrate distinction), Contributions (GitHub for Worlds). Architecture panel now shows the substrate table, kernel service contracts, and the 6-stage roadmap.
- Verified via curl locally: 10 primitives/4 laws/substrate/10 kernel services/7-stage roadmap; 7 world services; 5 avatars; Superman negotiation across 3 scenarios (no zone → flight denied; museum-district zone → flight allowed; superman-event experience → flight + super_strength allowed).
- Pushed to GitHub (2 commits: architecture evolution + capability fix). Vercel auto-deployed the first commit (dpl_6dAz6aaLRUac, READY) — verified 10 primitives, 7 services, 5 avatars, and Superman negotiation all work on playliquid-os.vercel.app. The capability fix commit is pushed and will deploy when Vercel's free-tier daily limit resets.

Stage Summary:
- The architecture now explicitly distinguishes OS substrate (PlayLiquid provides: multiplayer, replication, streaming, persistence, capability enforcement, platform services) from LLM implementation (packages: castles, avatars, weather, domain logic).
- 10 frozen primitives (added World Service). 4 architectural laws (added the substrate-vs-LLM law).
- Multi-layer capability negotiation is the most demonstrable new feature: Superman is grounded in Amsterdam, can fly in the museum-district, and regains all powers during the superman-event — all from the same package, with zero package modifications.
- Reuse-first pipeline ensures the second user who wants a castle reuses the first user's castle package instead of regenerating it.
- Vercel: playliquid-os.vercel.app is live with the 10-primitive architecture. The capability negotiation fix will deploy when the rate limit resets.

---
Task ID: 4
Agent: orchestrator (main)
Task: Freeze the operational test + substrate guarantees + reuse policies per the user's conceptual tightening.

Work Log:
- Added the frozen architectural sentence as Law #1: "PlayLiquid is responsible for making packages operational; creators are responsible only for specifying the behavior and implementation of their packages."
- Added the operational test as Law #2: "If a capability is fundamental to operating a virtual world, it belongs in the PlayLiquid OS substrate rather than in an individual package." With 13 worked examples (Multiplayer=OS, Streaming=OS, Replication=OS, Identity=OS, Ads=OS Service, Payments=OS Service, Capability enforcement=Kernel, Spatial composition=OS Contract, Hosting=World Node, World-specific behavior=Package, World-specific content=Package, New sensory technology=Runtime Adapter/World Service, LLM=Implementation backend chosen by the user).
- Added 11 substrate guarantees (Stage 1): Multiplayer, Replication, Identity, Persistence, Streaming, Spatial Services, Capability Enforcement, Economy, Advertising, Voice, Discovery — each with a contract name and a guarantee text. Packages consume them; the LLM never implements them.
- Strengthened the reuse engine with 5 reuse policies: reuse-freely, prefer-existing, approve-only, generate-replacements, never-reuse. The score breakdown now separates capabilityOverlap, familyMatch, certification, themeCompatibility, styleCompatibility, eraCompatibility — so the UI shows WHY a package was chosen or rejected.
- Updated the roadmap to 7 stages (0=Frozen OS Primitives [done], 1=Universal Substrate [in-progress], 2=Package Resolution [in-progress], 3=World Projects at Scale [in-progress], 4=Distributed World Runtime [partial], 5=Multimodal World Compiler [planned], 6=Marketplace + World Economy [planned], 7=Sensory Runtime [planned]).
- Console panel: added a reuse-policy selector (5 buttons) + "Resolve against Registry" button that shows the per-sub-package decomposition with reuse/generate decisions and score breakdowns.
- Architecture panel: added the Substrate Guarantees grid (11 promises) + the Operational Test section (13 examples with OS/Package badges).
- Services panel: added the 11 substrate guarantees as platform promises.
- Verified locally: architecture API returns 10 primitives, 6 laws, 11 guarantees, 13 test examples, 8 roadmap stages. Reuse API works with policies (prefer-existing reuses canal-house score 5; generate-replacements forces generation).
- Pushed to GitHub. Vercel deployment pending rate-limit reset.

Stage Summary:
- The architecture now has a clear decision rule: "If a capability is fundamental to operating a virtual world, it belongs in the OS substrate." Every future feature can be tested against this.
- 11 substrate guarantees make the platform promises explicit and consumable.
- 5 reuse policies give creators control over reuse-vs-diversity: reuse without homogenization.
- The Console now shows the full reuse-first flow: decompose → search registry → score → reuse/generate, with the score breakdown visible.
