"use client";

import { useEffect, useRef, useState } from "react";
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
  Globe,
  Play,
  Pause,
  Crosshair,
  Box,
  Anchor,
  Radio,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Scene types (mirror the API response) ─────────────────────────
interface SceneAnchor {
  id: string;
  semanticId: string;
  displayName: string;
  parent: string | null;
  type: string;
  semantic: string;
  coordinateSystem: string;
  global: { x: number; y: number; z: number };
  local: { x: number; y: number; z: number };
  orientation: { w: number; x: number; y: number; z: number };
  scale: number;
}

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
  world: {
    id: string;
    name: string;
    slug: string;
    buildVersion: number;
    buildHash: string;
    theme: Record<string, unknown>;
  };
  anchors: SceneAnchor[];
  entities: SceneEntity[];
  capabilities: Array<{ layer: string; capability: string; rules: unknown[] }>;
  runtime: {
    adapter: string;
    theme: string;
    coordinateSystem: string;
    protocolVersion: string;
  };
  nodes: Array<{ id: string; host: string; status: string }>;
}

// ── Family colors for rendering ───────────────────────────────────
const familyColors: Record<string, string> = {
  avatar: "#a78bfa",
  building: "#fbbf24",
  road: "#d6d3d1",
  vehicle: "#7dd3fc",
  creature: "#fb7185",
  physics: "#67e8f9",
  weather: "#93c5fd",
  economy: "#6ee7b7",
  audio: "#f0abfc",
  ai: "#f9a8d4",
  knowledge: "#a5b4fc",
  sensor: "#bef264",
  sensory: "#bef264",
  renderer: "#5eead4",
  input: "#fdba74",
  infrastructure: "#e5e5e5",
};

interface BrowserRuntimeProps {
  buildId: string | null;
}

export function BrowserRuntime({ buildId }: BrowserRuntimeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scene, setScene] = useState<WorldScene | null>(null);
  const [running, setRunning] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animationRef = useRef<number>(0);
  const sceneRef = useRef<WorldScene | null>(null);

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
    // Poll for updates (the kernel tick mutates entity positions)
    const interval = setInterval(fetchScene, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [buildId]);

  // Render the scene on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const s = sceneRef.current;
      if (!s) return;

      const W = canvas.width;
      const H = canvas.height;

      // Clear with dark background
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, W, H);

      // Draw grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      const offsetX = (W / 2) % gridSize;
      const offsetY = (H / 2) % gridSize;
      for (let x = offsetX; x < W; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = offsetY; y < H; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      // Draw center crosshair (world origin)
      ctx.strokeStyle = "rgba(78, 222, 184, 0.2)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 10, H / 2);
      ctx.lineTo(W / 2 + 10, H / 2);
      ctx.moveTo(W / 2, H / 2 - 10);
      ctx.lineTo(W / 2, H / 2 + 10);
      ctx.stroke();

      // Scale: PlayLiquid world units → canvas pixels
      const scale = 4;

      // ── Draw spatial anchors ──
      for (const a of s.anchors) {
        const cx = W / 2 + a.global.x * scale;
        const cy = H / 2 + a.global.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;

        // Anchor ring
        ctx.strokeStyle = "rgba(78, 222, 184, 0.3)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(78, 222, 184, 0.6)";
        ctx.font = "9px monospace";
        ctx.fillText(a.semanticId.split(".").pop() ?? a.semanticId, cx + 10, cy - 6);
      }

      // ── Draw entities ──
      for (const e of s.entities) {
        const cx = W / 2 + e.position.x * scale;
        const cy = H / 2 + e.position.z * scale;
        if (cx < 0 || cx > W || cy < 0 || cy > H) continue;

        const color = familyColors[e.package?.family ?? "building"] ?? "#888";
        const isSelected = selectedEntity === e.id;

        // Entity shape (different per family)
        const size = e.package?.family === "weather" ? 20 : e.package?.family === "building" ? 14 : 10;

        ctx.fillStyle = color;
        ctx.strokeStyle = isSelected ? "#fff" : color;
        ctx.lineWidth = isSelected ? 2 : 1;

        if (e.package?.family === "avatar") {
          // Circle for avatars
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, Math.PI * 2);
          ctx.fill();
          if (isSelected) ctx.stroke();
        } else if (e.package?.family === "building") {
          // Square for buildings
          ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
          if (isSelected) ctx.strokeRect(cx - size, cy - size, size * 2, size * 2);
        } else if (e.package?.family === "weather") {
          // Large faded circle for weather
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(cx, cy, size, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else {
          // Diamond for others
          ctx.beginPath();
          ctx.moveTo(cx, cy - size);
          ctx.lineTo(cx + size, cy);
          ctx.lineTo(cx, cy + size);
          ctx.lineTo(cx - size, cy);
          ctx.closePath();
          ctx.fill();
          if (isSelected) ctx.stroke();
        }

        // Label if selected or small scene
        if (isSelected || (s.entities.length < 15)) {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.font = "9px monospace";
          ctx.fillText(e.name.slice(0, 18), cx + size + 2, cy + 3);
        }
      }

      // ── Draw HUD ──
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px monospace";
      ctx.fillText(`PlayLiquid Web Runtime · protocol v${s.runtime.protocolVersion}`, 8, 14);
      ctx.fillText(`${s.entities.length} entities · ${s.anchors.length} anchors · ${s.world.name}`, 8, 28);
      ctx.fillText(`coord: ${s.runtime.coordinateSystem}`, 8, 42);

      if (running) {
        animationRef.current = requestAnimationFrame(render);
      }
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [scene, running, selectedEntity]);

  // Handle canvas click to select entity
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const scale = 4;
    // Find closest entity
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
  }

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
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading world scene…
      </div>
    );
  }

  const selectedEnt = scene.entities.find((e) => e.id === selectedEntity);

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
        <Badge variant="outline" className="font-mono text-[9px]">
          coord: {scene.runtime.coordinateSystem}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {scene.world.name} · build v{scene.world.buildVersion}
        </span>
        <Button
          size="sm"
          variant={running ? "outline" : "default"}
          className="h-7 gap-1.5"
          onClick={() => setRunning((r) => !r)}
        >
          {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {running ? "Pause" : "Play"}
        </Button>
      </div>

      {/* Canvas + side panel */}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
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
          {/* Selected entity inspector */}
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
                    <p className="mb-1 text-[10px] uppercase text-muted-foreground">Components</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedEnt.components.map((c) => (
                        <Badge key={c} variant="secondary" className="font-mono text-[9px]">{c}</Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase text-muted-foreground">State</p>
                    <pre className="max-h-24 overflow-auto rounded border border-border/50 bg-background/60 p-1.5 font-mono text-[9px] scroll-thin">
                      {JSON.stringify(selectedEnt.state, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <p className="py-4 text-center text-[11px] text-muted-foreground">Click an entity to inspect</p>
              )}
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
              <div className="max-h-32 space-y-1 overflow-y-auto scroll-thin">
                {scene.anchors.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No anchors</p>
                ) : (
                  scene.anchors.map((a) => (
                    <div key={a.id} className="flex items-center gap-1.5 text-[10px]">
                      <span className="font-mono text-emerald-300/70">{a.semanticId}</span>
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
              <Globe className="mr-1 h-2.5 w-2.5" /> world: {scene.world.slug}
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              <Anchor className="mr-1 h-2.5 w-2.5" /> {scene.anchors.length} anchors
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              <Box className="mr-1 h-2.5 w-2.5" /> {scene.entities.length} entities
            </Badge>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[9px] text-emerald-300">
              {scene.capabilities.length} capability policies
            </Badge>
            <Badge variant="outline" className="border-sky-500/30 bg-sky-500/10 font-mono text-[9px] text-sky-300">
              {scene.nodes.length} world nodes
            </Badge>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            This same scene graph can be consumed by a Unity adapter, Unreal adapter, or mobile runtime — the engine is an implementation detail; the world is not.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
