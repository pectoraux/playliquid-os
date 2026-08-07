"use client";

// ════════════════════════════════════════════════════════════════
// PLAYLIQUID WEB RUNTIME — Real Multiplayer
// ════════════════════════════════════════════════════════════════
//
// Phase B+C: The browser runtime now reads from the AUTHORITATIVE state
// stream (SSE), not from local state. When entity A moves on one browser,
// the Kernel updates authoritative state, and ALL browsers see the change
// in real-time. This is real multiplayer at the state-synchronization level.
//
// The flow:
//   1. Browser subscribes to /api/runtime/:buildId/stream (SSE)
//   2. Kernel sends initial state snapshot
//   3. Browser renders from authoritative state
//   4. Packages request mutations via /api/runtime/:buildId/mutate
//   5. Kernel updates authoritative state + replicates to all clients
//   6. All browsers see the same state

import { useEffect, useRef, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Monitor, Play, Pause, Crosshair, Box, Anchor, Radio, Cpu, Terminal,
  Layers, Shield, ShieldCheck, Users, Wifi, Zap,
} from "lucide-react";
import type {
  KernelContext, PackageInstance, RenderContext, DrawOpts, TextOpts,
} from "@/lib/playliquid/package-abi";
import { artifactLoader } from "@/lib/playliquid/packages";

// ── Scene + state types ───────────────────────────────────────────
interface SceneEntity {
  id: string; name: string;
  package: { name: string; family: string; displayName: string } | null;
  position: { x: number; y: number; z: number };
  components: string[]; state: Record<string, unknown>;
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

// Authoritative state received from the SSE stream
interface AuthoritativeEntity {
  position: { x: number; y: number; z: number };
  state: Record<string, unknown>;
}
interface SessionInfo {
  sessionId: string; name: string; connectedAt: number;
}

// ── CanvasRenderContext adapter ───────────────────────────────────
class CanvasRenderContext implements RenderContext {
  constructor(
    private ctx: CanvasRenderingContext2D,
    public screenX: number, public screenY: number,
    public worldX: number, public worldY: number, public worldZ: number,
    public scale: number, public selected: boolean
  ) {}
  drawRect(x: number, y: number, w: number, h: number, opts: DrawOpts): void {
    if (opts.fill) { this.ctx.fillStyle = opts.fill; this.ctx.fillRect(x, y, w, h); }
    if (opts.stroke) { this.ctx.strokeStyle = opts.stroke; this.ctx.lineWidth = opts.strokeWidth ?? 1; this.ctx.strokeRect(x, y, w, h); }
  }
  drawCircle(x: number, y: number, r: number, opts: DrawOpts): void {
    this.ctx.beginPath(); this.ctx.arc(x, y, r, 0, Math.PI * 2);
    if (opts.fill) { this.ctx.fillStyle = opts.fill; this.ctx.fill(); }
    if (opts.stroke) { this.ctx.strokeStyle = opts.stroke; this.ctx.lineWidth = opts.strokeWidth ?? 1; this.ctx.stroke(); }
  }
  drawLine(x1: number, y1: number, x2: number, y2: number, opts: DrawOpts): void {
    this.ctx.strokeStyle = opts.stroke ?? "#fff"; this.ctx.lineWidth = opts.strokeWidth ?? 1;
    this.ctx.beginPath(); this.ctx.moveTo(x1, y1); this.ctx.lineTo(x2, y2); this.ctx.stroke();
  }
  drawText(x: number, y: number, text: string, opts: TextOpts): void {
    this.ctx.fillStyle = opts.color ?? "#fff"; this.ctx.font = `${opts.size ?? 10}px monospace`;
    if (opts.align) this.ctx.textAlign = opts.align; this.ctx.fillText(text, x, y); this.ctx.textAlign = "left";
  }
  drawPath(points: Array<{ x: number; y: number }>, opts: DrawOpts): void {
    if (points.length < 2) return;
    this.ctx.beginPath(); this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.ctx.lineTo(points[i].x, points[i].y);
    this.ctx.closePath();
    if (opts.fill) { this.ctx.fillStyle = opts.fill; this.ctx.fill(); }
    if (opts.stroke) { this.ctx.strokeStyle = opts.stroke; this.ctx.lineWidth = opts.strokeWidth ?? 1; this.ctx.stroke(); }
  }
  pushTransform(x: number, y: number, rotation: number, scale: number): void {
    this.ctx.save(); this.ctx.translate(x, y); this.ctx.rotate(rotation); this.ctx.scale(scale, scale);
  }
  popTransform(): void { this.ctx.restore(); }
}

interface BrowserRuntimeProps { buildId: string | null; }

export function BrowserRuntime({ buildId }: BrowserRuntimeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<WorldScene | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [renderer, setRenderer] = useState<"canvas" | "text">("canvas");
  const [textOutput, setTextOutput] = useState("");
  const [tickCount, setTickCount] = useState(0);

  // Authoritative state — received from the SSE stream, NOT held locally
  const authStateRef = useRef<Map<string, AuthoritativeEntity>>(new Map());
  const sceneRef = useRef<WorldScene | null>(null);
  const packageInstancesRef = useRef<Map<string, PackageInstance>>(new Map());
  const animationRef = useRef<number>(0);
  const eventHandlersRef = useRef<Map<string, Array<(p: Record<string, unknown>) => void>>>(new Map());

  // Fetch scene (static — world structure)
  useEffect(() => {
    if (!buildId) return;
    let cancelled = false;
    async function fetchScene() {
      try {
        const res = await fetch(`/api/runtime/${buildId}/scene`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WorldScene;
        if (!cancelled) { setScene(data); sceneRef.current = data; setError(null); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load scene"); }
    }
    fetchScene();
  }, [buildId]);

  // Join session
  useEffect(() => {
    if (!buildId) return;
    fetch(`/api/runtime/${buildId}/session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", name: `Player-${Math.random().toString(36).slice(2, 6)}` }),
    }).then(r => r.json()).then(data => {
      setSessionId(data.sessionId);
      setSessions(data.sessions ?? []);
    }).catch(() => {});
    return () => {
      if (sessionId) {
        fetch(`/api/runtime/${buildId}/session`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "leave", sessionId }),
        }).catch(() => {});
      }
    };
  }, [buildId]);

  // ── SSE: subscribe to authoritative state stream ──────────────────
  // This is the replication layer. All connected browsers receive the
  // same state updates. When entity A moves on browser 1, browser 2
  // sees it in real-time.
  useEffect(() => {
    if (!buildId) return;
    const es = new EventSource(`/api/runtime/${buildId}/stream`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "snapshot") {
          // Initial state
          const map = new Map<string, AuthoritativeEntity>();
          for (const e of (msg.entities as Array<{ entityId: string; position: { x: number; y: number; z: number }; state: Record<string, unknown> }>)) {
            map.set(e.entityId, { position: e.position, state: e.state });
          }
          authStateRef.current = map;
          setSessions(msg.sessions ?? []);
        } else if (msg.type === "state") {
          // Incremental state update — this is the replication
          authStateRef.current.set(msg.entityId, { position: msg.position, state: msg.state });
        } else if (msg.type === "event") {
          if (msg.event === "session.join" || msg.event === "session.leave") {
            // Refresh sessions
            fetch(`/api/runtime/${buildId}/session`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "list" }),
            }).then(r => r.json()).then(data => setSessions(data.sessions ?? [])).catch(() => {});
          }
        }
      } catch { /* parse error */ }
    };
    return () => { es.close(); setConnected(false); };
  }, [buildId]);

  // ── KernelContext: requests go to the authoritative Kernel ────────
  // Packages don't hold state locally — they request mutations through
  // the Kernel API, which updates authoritative state + replicates.
  const createKernelContext = useCallback((entity: SceneEntity): KernelContext => {
    const entityId = entity.id;
    const buildIdLocal = buildId!;
    return {
      entityId,
      entityName: entity.name,
      getPosition: () => authStateRef.current.get(entityId)?.position ?? entity.position,
      requestMovement: (delta) => {
        // Send mutation to the authoritative Kernel
        fetch(`/api/runtime/${buildIdLocal}/mutate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityId, positionPatch: delta }),
        }).catch(() => {});
      },
      getState: () => authStateRef.current.get(entityId)?.state ?? entity.state,
      setState: (patch) => {
        // Send mutation to the authoritative Kernel
        fetch(`/api/runtime/${buildIdLocal}/mutate`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityId, statePatch: patch }),
        }).catch(() => {});
      },
      emit: (event, payload) => {
        (eventHandlersRef.current.get(event) ?? []).forEach((h) => h(payload));
      },
      on: (event, handler) => {
        if (!eventHandlersRef.current.has(event)) eventHandlersRef.current.set(event, []);
        eventHandlersRef.current.get(event)!.push(handler);
      },
      invokeCapability: async (capability) => {
        const s = sceneRef.current;
        if (!s) return { granted: false, action: "deny" as const };
        try {
          const res = await fetch("/api/capabilities/negotiate", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ packageId: entity.package?.name, worldProjectId: s.world.id }),
          });
          if (!res.ok) return { granted: false, action: "deny" as const };
          const data = await res.json();
          const effective = (data.effective as Array<{ capability: string; granted: boolean; action: string }>) ?? [];
          const result = effective.find((e) => e.capability === capability);
          return result
            ? { granted: result.granted, action: result.action as "allow" | "deny" | "limit" }
            : { granted: false, action: "deny" as const };
        } catch { return { granted: false, action: "deny" as const }; }
      },
      requestService: async () => ({ ok: true }),
      log: () => { /* could send to server */ },
    };
  }, [buildId]);

  // Initialize package instances
  useEffect(() => {
    if (!scene) return;
    for (const entity of scene.entities) {
      if (!entity.package) continue;
      const impl = artifactLoader.resolveByName(entity.package.name, entity.package.family);
      if (impl && !packageInstancesRef.current.has(entity.id)) {
        const ctx = createKernelContext(entity);
        const instance = impl.createInstance();
        instance.initialize(ctx, {
          name: entity.package.name, displayName: entity.package.displayName,
          family: entity.package.family, version: "1.0.0", specification: {},
          capabilities: impl.capabilities, provides: [], requires: [],
        });
        instance.mount();
        packageInstancesRef.current.set(entity.id, instance);
      }
    }
  }, [scene, createKernelContext]);

  // ── Auto-tick: trigger the server-side scheduler every 2s ─────────
  // In a full system, the Kernel would tick on its own. For the MVP,
  // any client can request a tick. The Kernel is still the authority.
  useEffect(() => {
    if (!buildId || !connected) return;
    const interval = setInterval(() => {
      fetch(`/api/runtime/${buildId}/tick`, { method: "POST" })
        .then(r => r.json())
        .then(data => setTickCount(c => c + 1))
        .catch(() => {});
    }, 2000);
    return () => clearInterval(interval);
  }, [buildId, connected]);

  // Render loop (canvas)
  useEffect(() => {
    if (renderer !== "canvas") return;
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    let running = true;
    const loop = () => {
      if (!running) return;
      const s = sceneRef.current;
      if (!s) { requestAnimationFrame(loop); return; }
      const W = canvas.width, H = canvas.height;

      ctx2d.fillStyle = "#0a0a0b"; ctx2d.fillRect(0, 0, W, H);
      ctx2d.strokeStyle = "rgba(255,255,255,0.04)"; ctx2d.lineWidth = 1;
      for (let x = (W / 2) % 40; x < W; x += 40) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke(); }
      for (let y = (H / 2) % 40; y < H; y += 40) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke(); }

      const scale = 4;

      // Update package instances from authoritative state
      for (const [, inst] of packageInstancesRef.current) inst.update(16);

      // Anchors
      for (const a of s.anchors) {
        const cx = W / 2 + a.global.x * scale, cy = H / 2 + a.global.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;
        ctx2d.strokeStyle = "rgba(78, 222, 184, 0.3)";
        ctx2d.beginPath(); ctx2d.arc(cx, cy, 8, 0, Math.PI * 2); ctx2d.stroke();
        ctx2d.fillStyle = "rgba(78, 222, 184, 0.6)"; ctx2d.font = "9px monospace";
        ctx2d.fillText(a.semanticId.split(".").pop() ?? a.semanticId, cx + 10, cy - 6);
      }

      // Render entities from AUTHORITATIVE state
      for (const entity of s.entities) {
        const authState = authStateRef.current.get(entity.id);
        const pos = authState?.position ?? entity.position;
        const state = authState?.state ?? entity.state;
        const cx = W / 2 + pos.x * scale, cy = H / 2 + pos.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;

        const inst = packageInstancesRef.current.get(entity.id);
        const isSelected = selectedEntity === entity.id;
        if (inst) {
          // Override the instance's ctx getState to return authoritative state
          const rc = new CanvasRenderContext(ctx2d, cx, cy, pos.x, pos.y, pos.z, scale, isSelected);
          // Temporarily patch the instance's state access to use authoritative state
          // (In a full system, the KernelContext would already read from authority)
          inst.render(rc);
        } else {
          ctx2d.fillStyle = "#666"; ctx2d.beginPath(); ctx2d.arc(cx, cy, 5, 0, Math.PI * 2); ctx2d.fill();
        }
        if (isSelected || s.entities.length < 15) {
          ctx2d.fillStyle = "rgba(255,255,255,0.7)"; ctx2d.font = "9px monospace";
          ctx2d.fillText(entity.name.slice(0, 18), cx + 14, cy + 3);
        }
      }

      // HUD
      ctx2d.fillStyle = "rgba(255,255,255,0.5)"; ctx2d.font = "10px monospace";
      ctx2d.fillText(`PlayLiquid Web Runtime · protocol v${s.runtime.protocolVersion}`, 8, 14);
      ctx2d.fillText(`${s.entities.length} entities · ${packageInstancesRef.current.size} instances · authoritative state`, 8, 28);
      ctx2d.fillText(`${connected ? "● connected" : "○ disconnected"} · ${sessions.length} players · tick #${tickCount}`, 8, 42);

      requestAnimationFrame(loop);
    };
    loop();
    return () => { running = false; };
  }, [scene, selectedEntity, renderer, connected, sessions.length, tickCount]);

  // Text renderer
  useEffect(() => {
    if (renderer !== "text" || !scene) return;
    const interval = setInterval(() => {
      const s = sceneRef.current;
      if (!s) return;
      const lines: string[] = [];
      lines.push("═══ PlayLiquid Text Runtime (adapter #2) ═══");
      lines.push(`World: ${s.world.name} v${s.world.buildVersion}`);
      lines.push(`${connected ? "● connected" : "○ disconnected"} · ${sessions.length} players · tick #${tickCount}`);
      lines.push(`Entities: ${s.entities.length} · Instances: ${packageInstancesRef.current.size}`);
      lines.push("");
      for (const entity of s.entities) {
        const auth = authStateRef.current.get(entity.id);
        const pos = auth?.position ?? entity.position;
        const state = auth?.state ?? entity.state;
        const stateKeys = Object.keys(state).slice(0, 4).map((k) => `${k}=${JSON.stringify(state[k])?.slice(0, 20)}`).join(", ");
        lines.push(`[${entity.id.slice(0, 8)}] ${entity.name} (${entity.package?.family ?? "?"})`);
        lines.push(`  pos: (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})  state: ${stateKeys}`);
      }
      lines.push("");
      lines.push("── Sessions (live multiplayer) ──");
      for (const sess of sessions) {
        lines.push(`  ${sess.sessionId.slice(0, 12)} ${sess.name} (connected ${new Date(sess.connectedAt).toLocaleTimeString()})`);
      }
      setTextOutput(lines.join("\n"));
    }, 500);
    return () => clearInterval(interval);
  }, [scene, renderer, connected, sessions, tickCount]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const scale = 4;
    let closest: string | null = null, minDist = 20;
    for (const ent of scene.entities) {
      const auth = authStateRef.current.get(ent.id);
      const pos = auth?.position ?? ent.position;
      const cx = canvas.width / 2 + pos.x * scale, cy = canvas.height / 2 + pos.z * scale;
      const dist = Math.hypot(cx - x, cy - y);
      if (dist < minDist) { minDist = dist; closest = ent.id; }
    }
    setSelectedEntity(closest);
    if (closest) {
      (eventHandlersRef.current.get("entity.click") ?? []).forEach((h) => h({ entityId: closest }));
    }
  }, [scene]);

  if (!buildId) return <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">Select a World Build to run.</div>;
  if (error) return <div className="flex h-64 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/[0.04] text-sm text-rose-300">Runtime error: {error}</div>;
  if (!scene) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading world scene…</div>;

  const selectedEnt = scene.entities.find((e) => e.id === selectedEntity);
  const loadedCount = packageInstancesRef.current.size;
  const authState = selectedEnt ? authStateRef.current.get(selectedEnt.id) : null;

  return (
    <div className="space-y-3">
      {/* Header with multiplayer status */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
          <Monitor className="mr-1 h-3 w-3" />PlayLiquid Web Runtime
        </Badge>
        <Badge variant="outline" className={`font-mono text-[9px] ${connected ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"}`}>
          <Wifi className="mr-1 h-2.5 w-2.5" />{connected ? "connected" : "disconnected"}
        </Badge>
        <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300">
          <Users className="mr-1 h-2.5 w-2.5" />{sessions.length} player{sessions.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300">
          <Cpu className="mr-1 h-2.5 w-2.5" />{loadedCount} instances
        </Badge>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
          <Zap className="mr-1 h-2.5 w-2.5" />tick #{tickCount}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">{scene.world.name} · v{scene.world.buildVersion}</span>
        <Select value={renderer} onValueChange={(v) => setRenderer(v as "canvas" | "text")}>
          <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="canvas">Canvas adapter</SelectItem>
            <SelectItem value="text">Text adapter</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Multiplayer banner */}
      {connected && sessions.length > 1 && (
        <Card className="border-sky-500/20 bg-sky-500/[0.03]">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs">
              <Users className="h-4 w-4 text-sky-400" />
              <span className="font-medium text-sky-300">Multiplayer active</span>
              <span className="text-muted-foreground">— {sessions.length} players connected. State is authoritative and replicated. Open this page in another tab to see real-time sync.</span>
            </div>
          </CardContent>
        </Card>
      )}

      {renderer === "canvas" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <Card className="overflow-hidden border-border bg-card/40">
            <canvas ref={canvasRef} width={640} height={400} onClick={handleCanvasClick} className="w-full cursor-crosshair" style={{ aspectRatio: "16/10" }} />
          </Card>
          <div className="space-y-3">
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Crosshair className="h-3.5 w-3.5 text-primary" />Entity (Authoritative)</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {selectedEnt ? (
                  <>
                    <div><p className="text-sm font-medium">{selectedEnt.name}</p><p className="font-mono text-[10px] text-muted-foreground">{selectedEnt.package?.name ?? "none"}</p></div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]">
                      <div className="rounded border border-border/50 bg-muted/30 p-1"><span className="text-muted-foreground">X</span><p className="font-mono text-foreground/80">{(authState?.position.x ?? selectedEnt.position.x).toFixed(1)}</p></div>
                      <div className="rounded border border-border/50 bg-muted/30 p-1"><span className="text-muted-foreground">Y</span><p className="font-mono text-foreground/80">{(authState?.position.y ?? selectedEnt.position.y).toFixed(1)}</p></div>
                      <div className="rounded border border-border/50 bg-muted/30 p-1"><span className="text-muted-foreground">Z</span><p className="font-mono text-foreground/80">{(authState?.position.z ?? selectedEnt.position.z).toFixed(1)}</p></div>
                    </div>
                    <div><p className="mb-1 text-[10px] uppercase text-muted-foreground">State (Kernel-authoritative)</p><pre className="max-h-24 overflow-auto rounded border border-border/50 bg-background/60 p-1.5 font-mono text-[9px] scroll-thin">{JSON.stringify(authState?.state ?? selectedEnt.state, null, 2)}</pre></div>
                  </>
                ) : <p className="py-4 text-center text-[11px] text-muted-foreground">Click an entity</p>}
              </CardContent>
            </Card>
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Users className="h-3.5 w-3.5 text-sky-400" />Connected Players</CardTitle></CardHeader>
              <CardContent><div className="space-y-1">{sessions.length === 0 ? <p className="text-[11px] text-muted-foreground">No players</p> : sessions.map((s) => (<div key={s.sessionId} className="flex items-center gap-2 text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /><span className="font-mono text-foreground/70">{s.name}</span><span className="ml-auto text-muted-foreground/50">{new Date(s.connectedAt).toLocaleTimeString()}</span></div>))}</div></CardContent>
            </Card>
            <Card className="border-border bg-card/40">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Anchor className="h-3.5 w-3.5 text-primary" />Anchors</CardTitle></CardHeader>
              <CardContent><div className="max-h-24 space-y-0.5 overflow-y-auto scroll-thin">{scene.anchors.slice(0, 8).map((a) => (<div key={a.id} className="flex items-center gap-1.5 text-[10px]"><span className="font-mono text-emerald-300/70">{a.semanticId.split(".").pop()}</span><span className="ml-auto font-mono text-muted-foreground/60">({a.global.x.toFixed(0)}, {a.global.z.toFixed(0)})</span></div>))}</div></CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Terminal className="h-3.5 w-3.5 text-primary" />Text Runtime — Second Adapter</CardTitle></CardHeader>
          <CardContent><pre className="overflow-auto rounded border border-border/50 bg-background/60 p-3 font-mono text-[10px] leading-relaxed text-foreground/80 scroll-thin">{textOutput}</pre></CardContent>
        </Card>
      )}

      {/* Protocol */}
      <Card className="border-border bg-card/40">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Radio className="h-3.5 w-3.5 text-primary" />PlayLiquid Protocol — Authoritative State</CardTitle></CardHeader>
        <CardContent><div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Box className="mr-1 h-2.5 w-2.5" />{scene.entities.length} entities</Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><Anchor className="mr-1 h-2.5 w-2.5" />{scene.anchors.length} anchors</Badge>
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300"><Wifi className="mr-1 h-2.5 w-2.5" />SSE stream</Badge>
          <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300"><Users className="mr-1 h-2.5 w-2.5" />{sessions.length} players</Badge>
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300"><ShieldCheck className="mr-1 h-2.5 w-2.5" />Kernel authority</Badge>
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[9px] text-amber-300"><Zap className="mr-1 h-2.5 w-2.5" />tick #{tickCount}</Badge>
        </div></CardContent>
      </Card>
    </div>
  );
}
