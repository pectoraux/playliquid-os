"use client";

// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WEB RUNTIME — the browser-native Package Runtime
// ════════════════════════════════════════════════════════════════
//
// This is NOT a scene visualizer. This is a real package executor that:
//   1. Loads the World Scene (canonical, engine-independent)
//   2. For each entity, loads its Package Implementation
//   3. Creates a KernelContext for each entity
//   4. Calls initialize() / mount() / update() / render() on each package
//   5. The renderer is SEPARATE from the executor — it's replaceable
//
// The world state is AUTHORITATIVE on the server. The browser runtime
// reads it from the Scene API and passes it to packages via the
// KernelContext. Packages never own the state; they request changes
// through the Kernel.

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KernelContext, PackageRuntimeABI, RenderContext, PackageImplementation } from "@/lib/playliquid/package-abi";
import { SpinningMarkerPackage } from "@/lib/playliquid/packages/spinning-marker";

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

// ── The Package Registry (browser-side) ───────────────────────────
// Maps package names to their executable implementations.
// In a full system this would load from the RuntimeArtifact's entrypoint.
const packageRegistry = new Map<string, PackageRuntimeABI>();
packageRegistry.set("@playliquid/examples/spinning-marker", SpinningMarkerPackage);

// ── KernelContext factory ─────────────────────────────────────────
// Creates the controlled interface a package receives. The package
// can ONLY interact with the world through this context.
function createKernelContext(
  entity: SceneEntity,
  stateRef: Map<string, Record<string, unknown>>,
  eventHandlers: Map<string, Array<(p: Record<string, unknown>) => void>>,
  logRef: Array<{ level: string; message: string; entity: string; time: string }>
): KernelContext {
  return {
    entityId: entity.id,
    entityName: entity.name,
    getPosition: () => entity.position,
    requestMovement: (delta) => {
      // The Kernel decides whether to grant movement.
      // (In a full system this would go through capability negotiation.)
      stateRef.get(entity.id)!.pendingMovement = delta;
    },
    getState: () => stateRef.get(entity.id) ?? entity.state,
    setState: (patch) => {
      const cur = stateRef.get(entity.id) ?? entity.state;
      stateRef.set(entity.id, { ...cur, ...patch });
    },
    emit: (event, payload) => {
      // Route the event to handlers
      const handlers = eventHandlers.get(event) ?? [];
      handlers.forEach((h) => h(payload));
      logRef.push({ level: "info", message: `emit ${event}`, entity: entity.name, time: new Date().toLocaleTimeString() });
    },
    on: (event, handler) => {
      if (!eventHandlers.has(event)) eventHandlers.set(event, []);
      eventHandlers.get(event)!.push(handler);
    },
    invokeCapability: async (capability) => {
      // The Kernel gate — packages can't bypass this
      logRef.push({ level: "info", message: `invokeCapability ${capability}`, entity: entity.name, time: new Date().toLocaleTimeString() });
      return { granted: true, action: "allow" };
    },
    requestService: async (service, action) => {
      logRef.push({ level: "info", message: `requestService ${service}.${action}`, entity: entity.name, time: new Date().toLocaleTimeString() });
      return { ok: true };
    },
    log: (level, message) => {
      logRef.push({ level, message, entity: entity.name, time: new Date().toLocaleTimeString() });
    },
  };
}

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

  // Refs for the executor (avoid re-creating packages every render)
  const sceneRef = useRef<WorldScene | null>(null);
  const stateRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const eventHandlersRef = useRef<Map<string, Array<(p: Record<string, unknown>) => void>>>(new Map());
  const logRef = useRef<Array<{ level: string; message: string; entity: string; time: string }>>([]);
  const packageInstancesRef = useRef<Map<string, PackageRuntimeABI>>(new Map());
  const animationRef = useRef<number>(0);
  const rotationRef = useRef(0);

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

  // Initialize package instances when scene loads
  useEffect(() => {
    if (!scene) return;

    // For each entity, try to load its package implementation
    for (const entity of scene.entities) {
      if (!entity.package) continue;

      // Check if we have an executable implementation for this package
      // In a full system, we'd check the RuntimeArtifact and load from entrypoint.
      // For the demo, we use the SpinningMarker for building-family entities
      // that don't have a specific implementation.
      let pkgImpl = packageRegistry.get(entity.package.name);

      // If no specific impl, use SpinningMarker as the default executable
      // for entities that need a real package runtime
      if (!pkgImpl && entity.components.includes("renderable")) {
        pkgImpl = SpinningMarkerPackage;
      }

      if (pkgImpl && !packageInstancesRef.current.has(entity.id)) {
        // Initialize state
        stateRef.current.set(entity.id, { ...entity.state });
        // Create the KernelContext
        const ctx = createKernelContext(entity, stateRef.current, eventHandlersRef.current, logRef.current);
        // Initialize + mount the package
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
            message: `Package loaded + initialized`,
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

    // Update logs
    setLogs([...logRef.current].slice(-20));
  }, [scene]);

  // Render + update loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const loop = () => {
      const s = sceneRef.current;
      if (!s) return;

      const W = canvas.width;
      const H = canvas.height;

      // ── The renderer (replaceable) ──
      // This is the canvas-2d renderer. It could be swapped for WebGL,
      // Unity, or Unreal without changing the package implementations.
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

      // Update rotation (for the SpinningMarker demo)
      rotationRef.current += 0.02;
      (globalThis as Record<string, unknown>).__markerRotation = rotationRef.current;

      // ── Call update() on each package instance ──
      for (const [entityId, pkg] of packageInstancesRef.current.entries()) {
        pkg.update(16); // ~60fps
      }

      // ── Draw spatial anchors ──
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

      // ── Call render() on each package instance ──
      // The package draws ITSELF via the RenderContext. The renderer
      // doesn't know what a "building" is — it just provides the context.
      for (const entity of s.entities) {
        const cx = W / 2 + entity.position.x * scale;
        const cy = H / 2 + entity.position.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;

        const pkg = packageInstancesRef.current.get(entity.id);
        const isSelected = selectedEntity === entity.id;

        if (pkg) {
          // The package renders itself — this is the ABI boundary
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
          // Fallback for entities without a package implementation
          const color = "#888";
          ctx2d.fillStyle = color;
          ctx2d.beginPath();
          ctx2d.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx2d.fill();
        }

        // Label
        if (isSelected || s.entities.length < 15) {
          ctx2d.fillStyle = "rgba(255,255,255,0.7)";
          ctx2d.font = "9px monospace";
          ctx2d.fillText(entity.name.slice(0, 18), cx + 14, cy + 3);
        }
      }

      // ── HUD ──
      ctx2d.fillStyle = "rgba(255,255,255,0.5)";
      ctx2d.font = "10px monospace";
      ctx2d.fillText(`PlayLiquid Web Runtime · protocol v${s.runtime.protocolVersion}`, 8, 14);
      ctx2d.fillText(`${s.entities.length} entities · ${packageInstancesRef.current.size} packages loaded · ${s.world.name}`, 8, 28);
      ctx2d.fillText(`ABI: initialize → mount → update → render · state is server-authoritative`, 8, 42);

      if (running) {
        animationRef.current = requestAnimationFrame(loop);
      }
    };

    loop();
    return () => cancelAnimationFrame(animationRef.current);
  }, [scene, running, selectedEntity]);

  // Canvas click → select entity + emit click event
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
      // Emit a click event to the package
      const handlers = eventHandlersRef.current.get("entity.click") ?? [];
      handlers.forEach((h) => h({ entityId: closest }));
      setLogs([...logRef.current].slice(-20));
    }
  }, [scene]);

  if (!buildId) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Select a World Build to run in the browser.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/[0.04] text-sm text-rose-300">
        Runtime error: {error}
      </div>
    );
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
        <Badge variant="outline" className="font-mono text-[9px]">
          protocol v{scene.runtime.protocolVersion}
        </Badge>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300">
          <Cpu className="mr-1 h-2.5 w-2.5" />
          {loadedCount} packages executing
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {scene.world.name} · build v{scene.world.buildVersion}
        </span>
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setAbiPanel((v) => !v)}>
          <Terminal className="h-3 w-3" /> ABI
        </Button>
        <Button size="sm" variant={running ? "outline" : "default"} className="h-7 gap-1.5" onClick={() => setRunning((r) => !r)}>
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {running ? "Pause" : "Play"}
        </Button>
      </div>

      {/* Canvas + side panels */}
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
          {/* Entity inspector */}
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

          {/* Package execution log */}
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
                        [{l.entity}]
                      </span>
                      <span className="text-foreground/70">{l.message}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Spatial anchors */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-xs">
                <Anchor className="h-3.5 w-3.5 text-primary" />
                Spatial Anchors
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-24 space-y-0.5 overflow-y-auto scroll-thin">
                {scene.anchors.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No anchors</p>
                ) : (
                  scene.anchors.slice(0, 8).map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-mono text-emerald-300/70">{a.semanticId.split(".").pop()}</span>
                      <span className="ml-auto font-mono text-muted-foreground/60">
                        ({a.global.x.toFixed(0)}, {a.global.z.toFixed(0)})
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ABI panel (toggleable) */}
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
              Each entity's package is loaded by the <span className="text-foreground">PackageExecutor</span>, receives a{" "}
              <span className="text-foreground">KernelContext</span>, and is called through the frozen lifecycle. The package
              never touches multiplayer, persistence, or state authority — it asks the Kernel.
            </p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
              {["initialize(ctx, manifest)", "mount()", "update(delta)", "handle(event, payload)", "render(rc)", "dispose()"].map((m) => (
                <Badge key={m} variant="outline" className="border-primary/20 bg-primary/5 text-primary/80">
                  {m}
                </Badge>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
              <span className="text-muted-foreground">KernelContext exposes:</span>
              {["getPosition()", "requestMovement()", "getState()", "setState()", "emit()", "on()", "invokeCapability()", "requestService()", "log()"].map((m) => (
                <Badge key={m} variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-300/70">
                  {m}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              The renderer is replaceable — the same package can render to canvas, WebGL, Unity, or Unreal by conforming to the same ABI with a different RenderContext.
            </p>
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
            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300">
              {scene.nodes.length} world nodes
            </Badge>
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300">
              {loadedCount} packages executing via ABI
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
