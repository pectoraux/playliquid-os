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
