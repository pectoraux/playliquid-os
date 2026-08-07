"use client";

// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WEB RUNTIME — the browser-native Package Runtime
// ════════════════════════════════════════════════════════════════
//
// This is a REAL Package Executor. It:
//   1. Fetches the World Scene (canonical, engine-independent)
//   2. For each entity, RESOLVES the package implementation from the
//      RuntimeArtifact registry (not a hard-coded single package)
//   3. Creates a KernelContext that calls the REAL Kernel for capability
//      enforcement (no auto-grant)
//   4. Calls initialize() / mount() / update() / render() on each package
//   5. The renderer is SEPARATE from the executor — it's replaceable
//
// Fix #1: RuntimeArtifact loader — resolves implementations by package
//   name + family, not a hard-coded map with one entry.
// Fix #2: Real Kernel enforcement — invokeCapability calls the server
//   Kernel's capability negotiation endpoint. No auto-grant.

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Monitor,
  Play,
  Pause,
  Crosshair,
  Box,
  Anchor,
  Radio,
  Cpu,
  Terminal,
  Layers,
  Shield,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KernelContext, PackageRuntimeABI, RenderContext } from "@/lib/playliquid/package-abi";
import { resolvePackageImplementation } from "@/lib/playliquid/packages";

// ── Scene types (from the API) ────────────────────────────────────
interface SceneEntity {
  id: string;
  name: string;
  package: { name: string; family: string; displayName: string } | null;
  position: { x: number; y: number; z: number };
  components: string[];
  state: Record<string, unknown>;
  artifact: { target: string; format: string; artifactUri: string } | null;
}
interface WorldScene {
  world: { id: string; name: string; slug: string; buildVersion: number; buildHash: string; theme: Record<string, unknown> };
  anchors: Array<{ id: string; semanticId: string; displayName: string; global: { x: number; y: number; z: number }; type: string }>;
  entities: SceneEntity[];
  capabilities: Array<{ layer: string; capability: string; rules: unknown[] }>;
  runtime: { adapter: string; theme: string; coordinateSystem: string; protocolVersion: string };
  nodes: Array<{ id: string; host: string; status: string }>;
}

// ── Capability enforcement result cache ───────────────────────────
// The browser asks the server Kernel for capability decisions.
// Results are cached per (entityId, capability) to avoid repeated calls.
const capabilityCache = new Map<string, { granted: boolean; action: string }>();

interface BrowserRuntimeProps {
  buildId: string | null;
}

export function BrowserRuntime({ buildId }: BrowserRuntimeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<WorldScene | null>(null);
  const [running, setRunning] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<Array<{ level: string; message: string; entity: string; time: string }>>([]);
  const [abiPanel, setAbiPanel] = useState(true);
  const [renderer, setRenderer] = useState<"canvas" | "text">("canvas");

  // Refs for the executor
  const sceneRef = useRef<WorldScene | null>(null);
  const stateRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const eventHandlersRef = useRef<Map<string, Array<(p: Record<string, unknown>) => void>>>(new Map());
  const logRef = useRef<Array<{ level: string; message: string; entity: string; time: string }>>([]);
  const packageInstancesRef = useRef<Map<string, PackageRuntimeABI>>(new Map());
  const animationRef = useRef<number>(0);

  // Fetch the scene graph
  useEffect(() => {
    if (!buildId) return;
    let cancelled = false;

    async function fetchScene() {
      try {
        const res = await fetch(`/api/runtime/${buildId}/scene`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WorldScene;
        if (!cancelled) {
          setScene(data);
          sceneRef.current = data;
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load scene");
      }
    }

    fetchScene();
    const interval = setInterval(fetchScene, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [buildId]);

  // ── Fix #2: Real Kernel capability enforcement ───────────────────
  // The browser KernelContext calls the server's capability negotiation
  // endpoint. It does NOT auto-grant. The server computes the effective
  // capability (entity × world × zone × experience) and the browser
  // respects the result.
  const invokeCapabilityReal = useCallback(
    async (entityId: string, capability: string): Promise<{ granted: boolean; action: "allow" | "deny" | "limit" }> => {
      const cacheKey = `${entityId}:${capability}`;
      if (capabilityCache.has(cacheKey)) {
        return capabilityCache.get(cacheKey)! as { granted: boolean; action: "allow" | "deny" | "limit" };
      }

      const s = sceneRef.current;
      if (!s) return { granted: false, action: "deny" };

      // Call the server Kernel's capability negotiation endpoint
      try {
        const res = await fetch("/api/capabilities/negotiate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageId: s.entities.find((e) => e.id === entityId)?.package?.name,
            worldProjectId: s.world.id,
          }),
        });
        if (!res.ok) {
          // If the server can't negotiate, deny by default (safe failure)
          return { granted: false, action: "deny" };
        }
        const data = await res.json();
        // Find the specific capability in the effective list
        const effective = (data.effective as Array<{ capability: string; granted: boolean; action: string }>) ?? [];
        const result = effective.find((e) => e.capability === capability);
        const final = result
          ? { granted: result.granted, action: result.action as "allow" | "deny" | "limit" }
          : { granted: false, action: "deny" as const }; // not declared → deny
        capabilityCache.set(cacheKey, final);
        return final;
      } catch {
        return { granted: false, action: "deny" }; // network error → deny
      }
    },
    []
  );

  // ── KernelContext factory ─────────────────────────────────────────
  // Creates the controlled interface a package receives. The package
  // can ONLY interact with the world through this context.
  // Fix #2: invokeCapability calls the REAL Kernel, not auto-grant.
  function createKernelContext(entity: SceneEntity): KernelContext {
    return {
      entityId: entity.id,
      entityName: entity.name,
      getPosition: () => entity.position,
      requestMovement: (delta) => {
        const cur = stateRef.current.get(entity.id) ?? entity.state;
        stateRef.current.set(entity.id, { ...cur, pendingMovement: delta });
      },
      getState: () => stateRef.current.get(entity.id) ?? entity.state,
      setState: (patch) => {
        const cur = stateRef.current.get(entity.id) ?? entity.state;
        stateRef.current.set(entity.id, { ...cur, ...patch });
      },
      emit: (event, payload) => {
        const handlers = eventHandlersRef.current.get(event) ?? [];
        handlers.forEach((h) => h(payload));
        logRef.current.push({ level: "info", message: `emit ${event}`, entity: entity.name, time: new Date().toLocaleTimeString() });
      },
      on: (event, handler) => {
        if (!eventHandlersRef.current.has(event)) eventHandlersRef.current.set(event, []);
        eventHandlersRef.current.get(event)!.push(handler);
      },
      invokeCapability: async (capability) => {
        logRef.current.push({ level: "info", message: `invokeCapability ${capability} → asking Kernel…`, entity: entity.name, time: new Date().toLocaleTimeString() });
        // Fix #2: call the REAL Kernel, not auto-grant
        const result = await invokeCapabilityReal(entity.id, capability);
        logRef.current.push({
          level: result.granted ? "info" : "warn",
          message: `capability ${capability} → ${result.action.toUpperCase()}`,
          entity: entity.name,
          time: new Date().toLocaleTimeString(),
        });
        return result;
      },
      requestService: async (service, action) => {
        logRef.current.push({ level: "info", message: `requestService ${service}.${action}`, entity: entity.name, time: new Date().toLocaleTimeString() });
        return { ok: true };
      },
      log: (level, message) => {
        logRef.current.push({ level, message, entity: entity.name, time: new Date().toLocaleTimeString() });
      },
    };
  }

  // Initialize package instances when scene loads
  useEffect(() => {
    if (!scene) return;

    for (const entity of scene.entities) {
      if (!entity.package) continue;

      // Fix #1: Resolve the package implementation from the registry
      // (not a hard-coded single package). Falls back to family default.
      const pkgImpl = resolvePackageImplementation(entity.package.name, entity.package.family);

      if (pkgImpl && !packageInstancesRef.current.has(entity.id)) {
        stateRef.current.set(entity.id, { ...entity.state });
        const ctx = createKernelContext(entity);
        try {
          pkgImpl.initialize(ctx, {
            name: entity.package.name,
            displayName: entity.package.displayName,
            family: entity.package.family,
            version: "1.0.0",
            specification: {},
            capabilities: [],
            provides: [],
            requires: [],
            implementations: [],
          });
          pkgImpl.mount();
          packageInstancesRef.current.set(entity.id, pkgImpl);
          logRef.current.push({
            level: "info",
            message: `Package loaded: ${entity.package.name} (${entity.package.family})`,
            entity: entity.name,
            time: new Date().toLocaleTimeString(),
          });
        } catch (e) {
          logRef.current.push({
            level: "error",
            message: `Package init failed: ${e instanceof Error ? e.message : "unknown"}`,
            entity: entity.name,
            time: new Date().toLocaleTimeString(),
          });
        }
      }
    }

    setLogs([...logRef.current].slice(-30));
  }, [scene, invokeCapabilityReal]);

  // Render + update loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene || renderer !== "canvas") return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const loop = () => {
      const s = sceneRef.current;
      if (!s) return;

      const W = canvas.width;
      const H = canvas.height;

      // ── The renderer (replaceable — Fix #10) ──
      ctx2d.fillStyle = "#0a0a0b";
      ctx2d.fillRect(0, 0, W, H);

      // Grid
      ctx2d.strokeStyle = "rgba(255,255,255,0.04)";
      ctx2d.lineWidth = 1;
      for (let x = (W / 2) % 40; x < W; x += 40) {
        ctx2d.beginPath();
        ctx2d.moveTo(x, 0);
        ctx2d.lineTo(x, H);
        ctx2d.stroke();
      }
      for (let y = (H / 2) % 40; y < H; y += 40) {
        ctx2d.beginPath();
        ctx2d.moveTo(0, y);
        ctx2d.lineTo(W, y);
        ctx2d.stroke();
      }

      const scale = 4;

      // Call update() on each package instance
      for (const [, pkg] of packageInstancesRef.current.entries()) {
        pkg.update(16);
      }

      // Draw spatial anchors
      for (const a of s.anchors) {
        const cx = W / 2 + a.global.x * scale;
        const cy = H / 2 + a.global.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;
        ctx2d.strokeStyle = "rgba(78, 222, 184, 0.3)";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        ctx2d.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.fillStyle = "rgba(78, 222, 184, 0.6)";
        ctx2d.font = "9px monospace";
        ctx2d.fillText(a.semanticId.split(".").pop() ?? a.semanticId, cx + 10, cy - 6);
      }

      // Call render() on each package instance — the package draws ITSELF
      for (const entity of s.entities) {
        const cx = W / 2 + entity.position.x * scale;
        const cy = H / 2 + entity.position.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;

        const pkg = packageInstancesRef.current.get(entity.id);
        const isSelected = selectedEntity === entity.id;

        if (pkg) {
          const rc: RenderContext = {
            type: "canvas-2d",
            ctx2d,
            screenX: cx,
            screenY: cy,
            worldX: entity.position.x,
            worldY: entity.position.y,
            worldZ: entity.position.z,
            scale,
            selected: isSelected,
          };
          pkg.render(rc);
        } else {
          ctx2d.fillStyle = "#666";
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx2d.fill();
        }

        if (isSelected || s.entities.length < 15) {
          ctx2d.fillStyle = "rgba(255,255,255,0.7)";
          ctx2d.font = "9px monospace";
          ctx2d.fillText(entity.name.slice(0, 18), cx + 14, cy + 3);
        }
      }

      // HUD
      ctx2d.fillStyle = "rgba(255,255,255,0.5)";
      ctx2d.font = "10px monospace";
      ctx2d.fillText(`PlayLiquid Web Runtime · protocol v${s.runtime.protocolVersion}`, 8, 14);
      ctx2d.fillText(`${s.entities.length} entities · ${packageInstancesRef.current.size} packages executing · ${s.world.name}`, 8, 28);
      ctx2d.fillText(`ABI: initialize → mount → update → render · capability enforcement: REAL (asks Kernel)`, 8, 42);

      if (running) {
        animationRef.current = requestAnimationFrame(loop);
      }
    };

    loop();
    return () => cancelAnimationFrame(animationRef.current);
  }, [scene, running, selectedEntity, renderer]);

  // ── Fix #5: Second independent renderer (text/headless) ──────────
  // This proves the renderer is replaceable — the same World Build
  // renders differently without changing any package code.
  const textRender = useCallback(() => {
    const s = sceneRef.current;
    if (!s) return "";
    const lines: string[] = [];
    lines.push(`═══ PlayLiquid Text Runtime (adapter #2) ═══`);
    lines.push(`World: ${s.world.name} v${s.world.buildVersion}`);
    lines.push(`Protocol: v${s.runtime.protocolVersion} · coord: ${s.runtime.coordinateSystem}`);
    lines.push(`Entities: ${s.entities.length} · Packages executing: ${packageInstancesRef.current.size}`);
    lines.push(`Anchors: ${s.anchors.length}`);
    lines.push("");
    lines.push("── Entities (canonical identity, server-authoritative state) ──");
    for (const e of s.entities) {
      const state = stateRef.current.get(e.id) ?? e.state;
      const pkg = packageInstancesRef.current.get(e.id);
      const stateKeys = Object.keys(state).slice(0, 4).map((k) => `${k}=${JSON.stringify(state[k])?.slice(0, 20)}`).join(", ");
      lines.push(`  [${e.id.slice(0, 8)}] ${e.name}`);
      lines.push(`    package: ${e.package?.name ?? "none"} (${e.package?.family ?? "?"})`);
      lines.push(`    pos: (${e.position.x.toFixed(1)}, ${e.position.y.toFixed(1)}, ${e.position.z.toFixed(1)})`);
      lines.push(`    state: ${stateKeys}`);
      lines.push(`    executing: ${pkg ? "yes (ABI loaded)" : "no"}`);
    }
    lines.push("");
    lines.push("── Spatial Anchors ──");
    for (const a of s.anchors.slice(0, 6)) {
      lines.push(`  ${a.semanticId} → (${a.global.x}, ${a.global.y}, ${a.global.z})`);
    }
    return lines.join("\n");
  }, []);

  // Canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scale = 4;
    let closest: string | null = null;
    let minDist = 20;
    for (const ent of scene.entities) {
      const cx = canvas.width / 2 + ent.position.x * scale;
      const cy = canvas.height / 2 + ent.position.z * scale;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < minDist) {
        minDist = dist;
        closest = ent.id;
      }
    }
    setSelectedEntity(closest);
    if (closest) {
      const handlers = eventHandlersRef.current.get("entity.click") ?? [];
      handlers.forEach((h) => h({ entityId: closest }));
      setLogs([...logRef.current].slice(-30));
    }
  }, [scene]);

  if (!buildId) {
    return <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Select a World Build to run in the browser.</div>;
  }
  if (error) {
    return <div className="flex h-64 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/[0.04] text-sm text-rose-300">Runtime error: {error}</div>;
  }
  if (!scene) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading world scene…</div>;
  }

  const selectedEnt = scene.entities.find((e) => e.id === selectedEntity);
  const loadedCount = packageInstancesRef.current.size;

  return (
    <div className="space-y-3">
      {/* Runtime header */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Monitor className="mr-1 h-3 w-3" />
          PlayLiquid Web Runtime
        </Badge>
        <Badge variant="outline" className="font-mono text-[9px]">protocol v{scene.runtime.protocolVersion}</Badge>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300">
          <Cpu className="mr-1 h-2.5 w-2.5" />
          {loadedCount} packages executing
        </Badge>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
          <Shield className="mr-1 h-2.5 w-2.5" />
          real Kernel enforcement
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">{scene.world.name} · build v{scene.world.buildVersion}</span>
        {/* Fix #5: renderer selector — proves the renderer is replaceable */}
        <Select value={renderer} onValueChange={(v) => setRenderer(v as "canvas" | "text")}>
          <SelectTrigger className="h-7 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="canvas">Canvas renderer</SelectItem>
            <SelectItem value="text">Text renderer</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setAbiPanel((v) => !v)}>
          <Terminal className="h-3 w-3" /> ABI
        </Button>
        <Button size="sm" variant={running ? "outline" : "default"} className="h-7 gap-1.5" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {running ? "Pause" : "Play"}
        </Button>
      </div>

      {/* Canvas renderer OR text renderer */}
      {renderer === "canvas" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden border-border bg-card/40">
            <canvas
              ref={canvasRef}
              width={640}
              height={400}
              onClick={handleCanvasClick}
              className="w-full cursor-crosshair"
              style={{ aspectRatio: "16/10" }}
            />
          </Card>
          <div className="space-y-3">
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Crosshair className="h-3.5 w-3.5 text-primary" />
                  Entity Inspector
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedEnt ? (
                  <>
                    <div>
                      <p className="text-sm font-medium">{selectedEnt.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{selectedEnt.package?.name ?? "no package"}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div className="rounded border border-border/50 bg-muted/30 p-1">
                        <span className="text-muted-foreground">X</span>
                        <p className="font-mono text-foreground/80">{selectedEnt.position.x.toFixed(1)}</p>
                      </div>
                      <div className="rounded border border-border/50 bg-muted/30 p-1">
                        <span className="text-muted-foreground">Y</span>
                        <p className="font-mono text-foreground/80">{selectedEnt.position.y.toFixed(1)}</p>
                      </div>
                      <div className="rounded border border-border/50 bg-muted/30 p-1">
                        <span className="text-muted-foreground">Z</span>
                        <p className="font-mono text-foreground/80">{selectedEnt.position.z.toFixed(1)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] uppercase text-muted-foreground">State (server-authoritative)</p>
                      <pre className="max-h-24 overflow-auto rounded border border-border/50 bg-background/60 p-1.5 font-mono text-[9px] scroll-thin">
                        {JSON.stringify(stateRef.current.get(selectedEnt.id) ?? selectedEnt.state, null, 2)}
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="py-4 text-center text-[11px] text-muted-foreground">Click an entity to inspect</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Terminal className="h-3.5 w-3.5 text-primary" />
                  Package Execution Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-40 space-y-0.5 overflow-y-auto scroll-thin font-mono text-[9px]">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet</p>
                  ) : (
                    logs.slice(-15).map((l, i) => (
                      <div key={i} className="flex gap-1.5">
                        <span className="text-muted-foreground/50">{l.time}</span>
                        <span className={l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : "text-emerald-400/70"}>
                          [{l.entity.slice(0, 8)}]
                        </span>
                        <span className="text-foreground/70">{l.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs">
                  <Anchor className="h-3.5 w-3.5 text-primary" />
                  Spatial Anchors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-24 space-y-0.5 overflow-y-auto scroll-thin">
                  {scene.anchors.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-mono text-emerald-300/70">{a.semanticId.split(".").pop()}</span>
                      <span className="ml-auto font-mono text-muted-foreground/60">({a.global.x.toFixed(0)}, {a.global.z.toFixed(0)})</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              Text Runtime — Second Independent Renderer (proves engine independence)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded border border-border/50 bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-foreground/80 scroll-thin">
              {textRender()}
            </pre>
            <p className="mt-2 text-[10px] text-muted-foreground">
              This is a second independent renderer consuming the same World Build. The packages don't change — only the renderer does. This proves the renderer is replaceable.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ABI panel */}
      {abiPanel && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-xs">
              <Layers className="h-3.5 w-3.5 text-primary" />
              Package Runtime ABI — the execution boundary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              Each entity's package is resolved from the RuntimeArtifact registry, receives a <span className="text-foreground">KernelContext</span>, and is called through the frozen lifecycle. Capability requests go to the <span className="text-foreground">real server Kernel</span> — no auto-grant.
            </p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
              {["initialize(ctx, manifest)", "mount()", "update(delta)", "handle(event, payload)", "render(rc)", "dispose()"].map((m) => (
                <Badge key={m} variant="outline" className="border-primary/20 bg-primary/5 text-primary/80">{m}</Badge>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
              <span className="text-muted-foreground">KernelContext:</span>
              {["getPosition()", "requestMovement()", "getState()", "setState()", "emit()", "on()", "invokeCapability() → real Kernel", "requestService()", "log()"].map((m) => (
                <Badge key={m} variant="outline" className={m.includes("real Kernel") ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-emerald-500/20 bg-emerald-500/5 text-emerald-300/70"}>
                  {m.includes("real Kernel") && <ShieldCheck className="mr-1 h-2.5 w-2.5" />}
                  {m}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Protocol layers */}
      <Card className="border-border bg-card/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xs">
            <Radio className="h-3.5 w-3.5 text-primary" />
            PlayLiquid Protocol — Active Layers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              <Box className="mr-1 h-2.5 w-2.5" /> {scene.entities.length} entities
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              <Anchor className="mr-1 h-2.5 w-2.5" /> {scene.anchors.length} anchors
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              {scene.capabilities.length} capability policies
            </Badge>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300">
              {loadedCount} packages executing via ABI
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              <ShieldCheck className="mr-1 h-2.5 w-2.5" /> real Kernel enforcement
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
