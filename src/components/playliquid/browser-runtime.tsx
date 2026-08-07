"use client";

// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WEB RUNTIME — Generic Package Executor
// ════════════════════════════════════════════════════════════════
//
// Phase A: a generic Package Executor that:
//   1. Resolves implementations through the RuntimeArtifactLoader
//      (not a hard-coded Map)
//   2. Creates a new PackageInstance per entity via createInstance()
//      (no singletons — 10,000 walkers each get isolated state)
//   3. Uses an engine-agnostic RenderContext (draw commands, not canvas types)
//   4. Calls the REAL Kernel for capability enforcement (no auto-grant)
//
// The renderer is SEPARATE from the executor. The CanvasRenderContext
// translates draw commands into canvas calls. A UnityRenderContext
// would translate them into Unity scene operations.

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
  Monitor, Play, Pause, Crosshair, Box, Anchor, Radio, Cpu, Terminal,
  Layers, Shield, ShieldCheck,
} from "lucide-react";
import type {
  KernelContext, PackageInstance, RenderContext, DrawOpts, TextOpts,
} from "@/lib/playliquid/package-abi";
import { artifactLoader } from "@/lib/playliquid/packages";

// ── Scene types ───────────────────────────────────────────────────
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
  world: { id: string; name: string; slug: string; buildVersion: number; buildHash: string };
  anchors: Array<{ id: string; semanticId: string; displayName: string; global: { x: number; y: number; z: number }; type: string }>;
  entities: SceneEntity[];
  capabilities: Array<{ layer: string; capability: string; rules: unknown[] }>;
  runtime: { adapter: string; theme: string; coordinateSystem: string; protocolVersion: string };
  nodes: Array<{ id: string; host: string; status: string }>;
}

// ── CanvasRenderContext: translates engine-agnostic draw commands ──
// into canvas-2d calls. This is the adapter — it could be swapped for
// WebGLRenderContext, UnityRenderContext, etc.
class CanvasRenderContext implements RenderContext {
  private transformStack: Array<{ x: number; y: number; rotation: number; scale: number }> = [];

  constructor(
    private ctx: CanvasRenderingContext2D,
    public screenX: number,
    public screenY: number,
    public worldX: number,
    public worldY: number,
    public worldZ: number,
    public scale: number,
    public selected: boolean
  ) {}

  drawRect(x: number, y: number, w: number, h: number, opts: DrawOpts): void {
    if (opts.fill) {
      this.ctx.fillStyle = opts.fill;
      this.ctx.fillRect(x, y, w, h);
    }
    if (opts.stroke) {
      this.ctx.strokeStyle = opts.stroke;
      this.ctx.lineWidth = opts.strokeWidth ?? 1;
      this.ctx.strokeRect(x, y, w, h);
    }
  }

  drawCircle(x: number, y: number, r: number, opts: DrawOpts): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    if (opts.fill) {
      this.ctx.fillStyle = opts.fill;
      this.ctx.fill();
    }
    if (opts.stroke) {
      this.ctx.strokeStyle = opts.stroke;
      this.ctx.lineWidth = opts.strokeWidth ?? 1;
      this.ctx.stroke();
    }
  }

  drawLine(x1: number, y1: number, x2: number, y2: number, opts: DrawOpts): void {
    this.ctx.strokeStyle = opts.stroke ?? "#fff";
    this.ctx.lineWidth = opts.strokeWidth ?? 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
  }

  drawText(x: number, y: number, text: string, opts: TextOpts): void {
    this.ctx.fillStyle = opts.color ?? "#fff";
    this.ctx.font = `${opts.size ?? 10}px monospace`;
    if (opts.align) this.ctx.textAlign = opts.align;
    this.ctx.fillText(text, x, y);
    this.ctx.textAlign = "left";
  }

  drawPath(points: Array<{ x: number; y: number }>, opts: DrawOpts): void {
    if (points.length < 2) return;
    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
    this.ctx.closePath();
    if (opts.fill) { this.ctx.fillStyle = opts.fill; this.ctx.fill(); }
    if (opts.stroke) { this.ctx.strokeStyle = opts.stroke; this.ctx.lineWidth = opts.strokeWidth ?? 1; this.ctx.stroke(); }
  }

  pushTransform(x: number, y: number, rotation: number, scale: number): void {
    this.transformStack.push({ x, y, rotation, scale });
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);
  }

  popTransform(): void {
    this.transformStack.pop();
    this.ctx.restore();
  }
}

// ── TextRenderContext: a second adapter (proves engine independence) ──
class TextRenderContext implements RenderContext {
  public screenX = 0;
  public screenY = 0;
  public worldX = 0;
  public worldY = 0;
  public worldZ = 0;
  public scale = 1;
  public selected = false;
  public commands: string[] = [];

  drawRect(x: number, y: number, w: number, h: number, opts: DrawOpts): void {
    this.commands.push(`  rect(${x.toFixed(0)},${y.toFixed(0)} ${w.toFixed(0)}x${h.toFixed(0)}) fill=${opts.fill ?? "-"}`);
  }
  drawCircle(x: number, y: number, r: number, opts: DrawOpts): void {
    this.commands.push(`  circle(${x.toFixed(0)},${y.toFixed(0)} r=${r.toFixed(0)}) fill=${opts.fill ?? "-"}`);
  }
  drawLine(x1: number, y1: number, x2: number, y2: number, opts: DrawOpts): void {
    this.commands.push(`  line(${x1.toFixed(0)},${y1.toFixed(0)}→${x2.toFixed(0)},${y2.toFixed(0)})`);
  }
  drawText(x: number, y: number, text: string, _opts: TextOpts): void {
    this.commands.push(`  text(${x.toFixed(0)},${y.toFixed(0)}) "${text}"`);
  }
  drawPath(points: Array<{ x: number; y: number }>, opts: DrawOpts): void {
    this.commands.push(`  path(${points.length} pts) fill=${opts.fill ?? "-"}`);
  }
  pushTransform(_x: number, _y: number, _r: number, _s: number): void {
    this.commands.push("  pushTransform");
  }
  popTransform(): void {
    this.commands.push("  popTransform");
  }
}

// ── Capability cache ──────────────────────────────────────────────
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
  const [textOutput, setTextOutput] = useState("");

  const sceneRef = useRef<WorldScene | null>(null);
  const stateRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const eventHandlersRef = useRef<Map<string, Array<(p: Record<string, unknown>) => void>>>(new Map());
  const logRef = useRef<Array<{ level: string; message: string; entity: string; time: string }>>([]);
  // Phase A: Map of entityId → PackageInstance (each entity gets its own instance)
  const packageInstancesRef = useRef<Map<string, PackageInstance>>(new Map());
  const animationRef = useRef<number>(0);

  // Fetch scene
  useEffect(() => {
    if (!buildId) return;
    let cancelled = false;
    async function fetchScene() {
      try {
        const res = await fetch(`/api/runtime/${buildId}/scene`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WorldScene;
        if (!cancelled) { setScene(data); sceneRef.current = data; setError(null); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load scene");
      }
    }
    fetchScene();
    const interval = setInterval(fetchScene, 4000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [buildId]);

  // Real Kernel capability enforcement
  const invokeCapabilityReal = useCallback(async (entityId: string, capability: string) => {
    const cacheKey = `${entityId}:${capability}`;
    if (capabilityCache.has(cacheKey)) return capabilityCache.get(cacheKey)!;
    const s = sceneRef.current;
    if (!s) return { granted: false, action: "deny" as const };
    try {
      const res = await fetch("/api/capabilities/negotiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: s.entities.find((e) => e.id === entityId)?.package?.name,
          worldProjectId: s.world.id,
        }),
      });
      if (!res.ok) return { granted: false, action: "deny" as const };
      const data = await res.json();
      const effective = (data.effective as Array<{ capability: string; granted: boolean; action: string }>) ?? [];
      const result = effective.find((e) => e.capability === capability);
      const final = result
        ? { granted: result.granted, action: result.action as "allow" | "deny" | "limit" }
        : { granted: false, action: "deny" as const };
      capabilityCache.set(cacheKey, final);
      return final;
    } catch {
      return { granted: false, action: "deny" as const };
    }
  }, []);

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
        (eventHandlersRef.current.get(event) ?? []).forEach((h) => h(payload));
        logRef.current.push({ level: "info", message: `emit ${event}`, entity: entity.name, time: new Date().toLocaleTimeString() });
      },
      on: (event, handler) => {
        if (!eventHandlersRef.current.has(event)) eventHandlersRef.current.set(event, []);
        eventHandlersRef.current.get(event)!.push(handler);
      },
      invokeCapability: async (capability) => {
        logRef.current.push({ level: "info", message: `invokeCapability ${capability} → asking Kernel…`, entity: entity.name, time: new Date().toLocaleTimeString() });
        const result = await invokeCapabilityReal(entity.id, capability);
        logRef.current.push({ level: result.granted ? "info" : "warn", message: `capability ${capability} → ${result.action.toUpperCase()}`, entity: entity.name, time: new Date().toLocaleTimeString() });
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

  // Phase A: Initialize package INSTANCES via the loader + createInstance()
  useEffect(() => {
    if (!scene) return;
    for (const entity of scene.entities) {
      if (!entity.package) continue;
      // Resolve through the loader (not a hard-coded Map)
      const impl = artifactLoader.resolveByName(entity.package.name, entity.package.family);
      if (impl && !packageInstancesRef.current.has(entity.id)) {
        stateRef.current.set(entity.id, { ...entity.state });
        const ctx = createKernelContext(entity);
        try {
          // Phase A: createInstance() — each entity gets its own instance
          const instance = impl.createInstance();
          instance.initialize(ctx, {
            name: entity.package.name,
            displayName: entity.package.displayName,
            family: entity.package.family,
            version: "1.0.0",
            specification: {},
            capabilities: impl.capabilities,
            provides: [],
            requires: [],
          });
          instance.mount();
          packageInstancesRef.current.set(entity.id, instance);
          logRef.current.push({ level: "info", message: `Instance created: ${entity.package.name} (${entity.package.family})`, entity: entity.name, time: new Date().toLocaleTimeString() });
        } catch (e) {
          logRef.current.push({ level: "error", message: `Instance init failed: ${e instanceof Error ? e.message : "?"}`, entity: entity.name, time: new Date().toLocaleTimeString() });
        }
      }
    }
    setLogs([...logRef.current].slice(-30));
  }, [scene, invokeCapabilityReal]);

  // Render + update loop (canvas)
  useEffect(() => {
    if (renderer !== "canvas") return;
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const loop = () => {
      const s = sceneRef.current;
      if (!s) return;
      const W = canvas.width, H = canvas.height;

      ctx2d.fillStyle = "#0a0a0b";
      ctx2d.fillRect(0, 0, W, H);
      ctx2d.strokeStyle = "rgba(255,255,255,0.04)";
      ctx2d.lineWidth = 1;
      for (let x = (W / 2) % 40; x < W; x += 40) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke(); }
      for (let y = (H / 2) % 40; y < H; y += 40) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke(); }

      const scale = 4;

      // Update all instances
      for (const [, inst] of packageInstancesRef.current) inst.update(16);

      // Anchors
      for (const a of s.anchors) {
        const cx = W / 2 + a.global.x * scale, cy = H / 2 + a.global.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;
        ctx2d.strokeStyle = "rgba(78, 222, 184, 0.3)";
        ctx2d.beginPath(); ctx2d.arc(cx, cy, 8, 0, Math.PI * 2); ctx2d.stroke();
        ctx2d.fillStyle = "rgba(78, 222, 184, 0.6)";
        ctx2d.font = "9px monospace";
        ctx2d.fillText(a.semanticId.split(".").pop() ?? a.semanticId, cx + 10, cy - 6);
      }

      // Render each instance through the CanvasRenderContext adapter
      for (const entity of s.entities) {
        const cx = W / 2 + entity.position.x * scale, cy = H / 2 + entity.position.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;
        const inst = packageInstancesRef.current.get(entity.id);
        const isSelected = selectedEntity === entity.id;
        if (inst) {
          const rc = new CanvasRenderContext(ctx2d, cx, cy, entity.position.x, entity.position.y, entity.position.z, scale, isSelected);
          inst.render(rc);
        } else {
          ctx2d.fillStyle = "#666";
          ctx2d.beginPath(); ctx2d.arc(cx, cy, 5, 0, Math.PI * 2); ctx2d.fill();
        }
        if (isSelected || s.entities.length < 15) {
          ctx2d.fillStyle = "rgba(255,255,255,0.7)";
          ctx2d.font = "9px monospace";
          ctx2d.fillText(entity.name.slice(0, 18), cx + 14, cy + 3);
        }
      }

      ctx2d.fillStyle = "rgba(255,255,255,0.5)";
      ctx2d.font = "10px monospace";
      ctx2d.fillText(`PlayLiquid Web Runtime · protocol v${s.runtime.protocolVersion}`, 8, 14);
      ctx2d.fillText(`${s.entities.length} entities · ${packageInstancesRef.current.size} instances · ${s.world.name}`, 8, 28);
      ctx2d.fillText(`generic executor · createInstance() per entity · engine-agnostic RenderContext`, 8, 42);

      if (running) animationRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationRef.current);
  }, [scene, running, selectedEntity, renderer]);

  // Text renderer loop
  useEffect(() => {
    if (renderer !== "text" || !scene) return;
    const interval = setInterval(() => {
      const s = sceneRef.current;
      if (!s) return;
      const lines: string[] = [];
      lines.push("═══ PlayLiquid Text Runtime (adapter #2) ═══");
      lines.push(`World: ${s.world.name} v${s.world.buildVersion}`);
      lines.push(`Protocol: v${s.runtime.protocolVersion} · coord: ${s.runtime.coordinateSystem}`);
      lines.push(`Entities: ${s.entities.length} · Instances: ${packageInstancesRef.current.size}`);
      lines.push("");
      for (const entity of s.entities) {
        const inst = packageInstancesRef.current.get(entity.id);
        const state = stateRef.current.get(entity.id) ?? entity.state;
        const stateKeys = Object.keys(state).slice(0, 4).map((k) => `${k}=${JSON.stringify(state[k])?.slice(0, 20)}`).join(", ");
        lines.push(`[${entity.id.slice(0, 8)}] ${entity.name} (${entity.package?.family ?? "?"})`);
        lines.push(`  pos: (${entity.position.x.toFixed(1)}, ${entity.position.z.toFixed(1)})  state: ${stateKeys}`);
        if (inst) {
          const trc = new TextRenderContext();
          inst.render(trc);
          lines.push(`  render commands:`);
          trc.commands.forEach((c) => lines.push(c));
        }
        lines.push("");
      }
      setTextOutput(lines.join("\n"));
    }, 500);
    return () => clearInterval(interval);
  }, [scene, renderer]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const scale = 4;
    let closest: string | null = null, minDist = 20;
    for (const ent of scene.entities) {
      const cx = canvas.width / 2 + ent.position.x * scale, cy = canvas.height / 2 + ent.position.z * scale;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < minDist) { minDist = dist; closest = ent.id; }
    }
    setSelectedEntity(closest);
    if (closest) {
      (eventHandlersRef.current.get("entity.click") ?? []).forEach((h) => h({ entityId: closest }));
      setLogs([...logRef.current].slice(-30));
    }
  }, [scene]);

  if (!buildId) return <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Select a World Build to run.</div>;
  if (error) return <div className="flex h-64 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/[0.04] text-sm text-rose-300">Runtime error: {error}</div>;
  if (!scene) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading world scene…</div>;

  const selectedEnt = scene.entities.find((e) => e.id === selectedEntity);
  const loadedCount = packageInstancesRef.current.size;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><Monitor className="mr-1 h-3 w-3" />PlayLiquid Web Runtime</Badge>
        <Badge variant="outline" className="font-mono text-[9px]">protocol v{scene.runtime.protocolVersion}</Badge>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300"><Cpu className="mr-1 h-2.5 w-2.5" />{loadedCount} instances</Badge>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Shield className="mr-1 h-2.5 w-2.5" />real Kernel</Badge>
        <span className="ml-auto text-xs text-muted-foreground">{scene.world.name} · v{scene.world.buildVersion}</span>
        <Select value={renderer} onValueChange={(v) => setRenderer(v as "canvas" | "text")}>
          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="canvas">Canvas adapter</SelectItem>
            <SelectItem value="text">Text adapter</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 gap-1.5" onClick={() => setAbiPanel((v) => !v)}><Terminal className="h-3 w-3" /> ABI</Button>
        <Button size="sm" variant={running ? "outline" : "default"} className="h-7 gap-1.5" onClick={() => setRunning((r) => !r)}>{running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}{running ? "Pause" : "Play"}</Button>
      </div>

      {renderer === "canvas" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden border-border bg-card/40">
            <canvas ref={canvasRef} width={640} height={400} onClick={handleCanvasClick} className="w-full cursor-crosshair" style={{ aspectRatio: "16/10" }} />
          </Card>
          <div className="space-y-3">
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Crosshair className="h-3.5 w-3.5 text-primary" />Entity Inspector</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {selectedEnt ? (
                  <>
                    <div><p className="text-sm font-medium">{selectedEnt.name}</p><p className="font-mono text-[10px] text-muted-foreground">{selectedEnt.package?.name ?? "none"}</p></div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div className="rounded border border-border/50 bg-muted/30 p-1"><span className="text-muted-foreground">X</span><p className="font-mono text-foreground/80">{selectedEnt.position.x.toFixed(1)}</p></div>
                      <div className="rounded border border-border/50 bg-muted/30 p-1"><span className="text-muted-foreground">Y</span><p className="font-mono text-foreground/80">{selectedEnt.position.y.toFixed(1)}</p></div>
                      <div className="rounded border border-border/50 bg-muted/30 p-1"><span className="text-muted-foreground">Z</span><p className="font-mono text-foreground/80">{selectedEnt.position.z.toFixed(1)}</p></div>
                    </div>
                    <div><p className="mb-1 text-[10px] uppercase text-muted-foreground">State (Kernel-authoritative)</p><pre className="max-h-24 overflow-auto rounded border border-border/50 bg-background/60 p-1.5 font-mono text-[9px] scroll-thin">{JSON.stringify(stateRef.current.get(selectedEnt.id) ?? selectedEnt.state, null, 2)}</pre></div>
                  </>
                ) : <p className="py-4 text-center text-[11px] text-muted-foreground">Click an entity</p>}
              </CardContent>
            </Card>
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Terminal className="h-3.5 w-3.5 text-primary" />Execution Log</CardTitle></CardHeader>
              <CardContent><div className="max-h-40 space-y-0.5 overflow-y-auto scroll-thin font-mono text-[9px]">{logs.length === 0 ? <p className="text-muted-foreground">No activity</p> : logs.slice(-15).map((l, i) => (<div key={i} className="flex gap-1.5"><span className="text-muted-foreground/50">{l.time}</span><span className={l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : "text-emerald-400/70"}>[{l.entity.slice(0, 8)}]</span><span className="text-foreground/70">{l.message}</span></div>))}</div></CardContent>
            </Card>
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Anchor className="h-3.5 w-3.5 text-primary" />Anchors</CardTitle></CardHeader>
              <CardContent><div className="max-h-24 space-y-0.5 overflow-y-auto scroll-thin">{scene.anchors.slice(0, 8).map((a) => (<div key={a.id} className="flex items-center gap-1.5 text-[10px]"><span className="font-mono text-emerald-300/70">{a.semanticId.split(".").pop()}</span><span className="ml-auto font-mono text-muted-foreground/60">({a.global.x.toFixed(0)}, {a.global.z.toFixed(0)})</span></div>))}</div></CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Terminal className="h-3.5 w-3.5 text-primary" />Text Runtime — Second Adapter (proves engine independence)</CardTitle></CardHeader>
          <CardContent><pre className="overflow-auto rounded border border-border/50 bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-foreground/80 scroll-thin">{textOutput}</pre><p className="mt-2 text-[10px] text-muted-foreground">The same packages issue the same draw commands — only the adapter changes. Canvas adapter translates to canvas-2d; Text adapter logs them.</p></CardContent>
        </Card>
      )}

      {abiPanel && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Layers className="h-3.5 w-3.5 text-primary" />Package Runtime ABI — Generic Executor</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">Each entity gets its own <span className="text-foreground">PackageInstance</span> via <code className="text-primary">createInstance()</code>. Implementations resolved through <span className="text-foreground">RuntimeArtifactLoader</span>. RenderContext is <span className="text-foreground">engine-agnostic</span> (draw commands, not canvas types).</p>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary/80">createInstance() → PackageInstance</Badge>
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary/80">initialize → mount → update → render → dispose</Badge>
              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-300/70"><ShieldCheck className="mr-1 h-2.5 w-2.5" />invokeCapability → real Kernel</Badge>
              <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-300/70">drawRect / drawCircle / drawText / drawPath</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border bg-card/40">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Radio className="h-3.5 w-3.5 text-primary" />PlayLiquid Protocol</CardTitle></CardHeader>
        <CardContent><div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Box className="mr-1 h-2.5 w-2.5" />{scene.entities.length} entities</Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Anchor className="mr-1 h-2.5 w-2.5" />{scene.anchors.length} anchors</Badge>
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300">{loadedCount} instances</Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><ShieldCheck className="mr-1 h-2.5 w-2.5" />real Kernel</Badge>
        </div></CardContent>
      </Card>
    </div>
  );
}
