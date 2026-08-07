"use client";

import { useArchitecture } from "@/hooks/use-playliquid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Boxes,
  FileJson,
  Plug,
  Box,
  Globe,
  Layers3,
  Cpu,
  MonitorSmartphone,
  Server,
  ChevronRight,
  Scale,
  Workflow,
  ArrowDown,
  Shield,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const primitiveIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Package: Boxes,
  Specification: FileJson,
  Contract: Plug,
  "Interface / Contract": Plug,
  Entity: Box,
  "World Project": Globe,
  "World Build": Layers3,
  Kernel: Cpu,
  "Runtime Adapter": MonitorSmartphone,
  "World Node": Server,
  "World Service": Shield,
};

export function ArchitecturePanel() {
  const { data: arch, isLoading } = useArchitecture();

  if (isLoading || !arch) {
    return (
      <div className="grid gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero / frozen architecture diagram */}
      <Card className="overflow-hidden border-border bg-card/60">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" />
              Frozen Architecture
            </CardTitle>
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              9 primitives · immutable
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border bg-background/40 p-4 grid-bg">
            <pre className="font-mono text-[10px] leading-relaxed text-muted-foreground sm:text-[11px] whitespace-pre">
{`                    PLAYLIQUID OS
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    SPECIFICATION     REGISTRY        PROJECTS
        │                │                │
    AI Architect     Packages        Git-like World
    Multimodal       Versions        Contributions
        │             Contracts       Policies
        │                │                │
        └────────────────┼────────────────┘
                         │
                    COMPOSITION
                  Dependency · Spatial ·
                  Capability · Event Graphs
                         │
                       BUILD
                         │
                  Immutable Manifest
                         │
                    WORLD NODE
                         │
        ┌────────────────┼─────────────────┐
        │                │                 │
      KERNEL          SERVICES          RUNTIME
   Scheduler        Multiplayer       Entity Runtime
   Event Bus        Streaming         Rendering Adapter
   Entities         Persistence       Audio Adapter
   Networking       Ads               Input Adapter
   Replication      Voice             Sensor Adapter
   Capabilities     Identity
   Spatial          Analytics
        │
        └──────────────────────────────────┘
                         │
                  USER'S WORLD`}
            </pre>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            10 frozen primitives. The OS provides <span className="text-foreground">multiplayer, streaming, persistence, capability enforcement, and platform services</span> — the user's LLM only implements <span className="text-foreground">packages</span> against those contracts.
          </p>
        </CardContent>
      </Card>

      {/* The 10 primitives */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">The 10 Permanent Contracts</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {arch.primitives.map((p) => {
            const Icon = primitiveIcons[p.name] ?? Box;
            return (
              <Card
                key={p.id}
                className="group relative overflow-hidden border-border bg-card/50 transition-colors hover:border-primary/40"
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      #{String(p.id).padStart(2, "0")}
                    </span>
                  </div>
                  <h4 className="mt-3 text-sm font-semibold text-foreground">{p.name}</h4>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.role}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* The two pipelines */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Workflow className="h-4 w-4" /> The Permanent Pipelines
        </h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {arch.pipelines.map((pipe) => (
            <Card key={pipe.name} className="border-border bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{pipe.name} Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-1">
                  {pipe.stages.map((stage, i) => (
                    <li key={stage} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-border bg-muted/50 font-mono text-[10px] text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="font-mono text-xs text-foreground/90">{stage}</span>
                      {i < pipe.stages.length - 1 && (
                        <ArrowDown className="ml-auto h-3 w-3 text-muted-foreground/40" />
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* The 3 laws */}
      <Card className="border-amber-500/20 bg-amber-500/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Scale className="h-4 w-4 text-amber-400" /> The Three Architectural Laws
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {arch.laws.map((law, i) => (
            <div key={i} className="flex gap-3 text-xs leading-relaxed text-foreground/80">
              <span className="font-mono font-semibold text-amber-400">L{i + 1}</span>
              <span>{law}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* OS substrate vs LLM implementation */}
      {arch.substrate && (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-primary" />
              The Critical Distinction: OS Substrate vs LLM Implementation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
                <h4 className="mb-2 text-xs font-semibold text-emerald-400">PlayLiquid OS provides</h4>
                <ul className="space-y-1 text-xs text-foreground/80">
                  {arch.substrate.osProvides.map((x) => (
                    <li key={x} className="flex items-start gap-1.5">
                      <span className="text-emerald-400">▸</span> {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.04] p-4">
                <h4 className="mb-2 text-xs font-semibold text-violet-400">User's LLM implements</h4>
                <ul className="space-y-1 text-xs text-foreground/80">
                  {arch.substrate.llmImplements.map((x) => (
                    <li key={x} className="flex items-start gap-1.5">
                      <span className="text-violet-400">▸</span> {x}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kernel services */}
      {arch.kernelServices && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Kernel Service Contracts (OS substrate)</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {arch.kernelServices.map((s) => (
              <div key={s.contract} className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3">
                <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{s.name}</span>
                    <Badge variant="outline" className="font-mono text-[9px] text-primary/70">{s.contract}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{s.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roadmap */}
      {arch.roadmap && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Six-Stage Roadmap</h3>
          <Card className="border-border bg-card/40">
            <CardContent className="divide-y divide-border p-0">
              {arch.roadmap.map((r) => {
                const Icon = r.status === "done" ? CheckCircle2 : r.status === "in-progress" || r.status === "partial" ? Loader2 : Circle;
                const color = r.status === "done" ? "text-emerald-400" : r.status === "in-progress" || r.status === "partial" ? "text-amber-400" : "text-muted-foreground";
                return (
                  <div key={r.stage} className="flex items-start gap-3 p-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color} ${r.status === "in-progress" || r.status === "partial" ? "animate-spin" : ""}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[9px]">Stage {r.stage}</Badge>
                        <span className="text-xs font-medium">{r.name}</span>
                        <Badge variant="outline" className={`ml-auto text-[9px] uppercase ${
                          r.status === "done" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
                          r.status === "in-progress" || r.status === "partial" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" :
                          "border-border text-muted-foreground"
                        }`}>{r.status}</Badge>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{r.detail}</p>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Extension table */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">
          Everything Else Is an Extension
        </h3>
        <Card className="overflow-hidden border-border bg-card/40">
          <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            {chunk(arch.extensionTable, Math.ceil(arch.extensionTable.length / 2)).map((half, hi) => (
              <div key={hi} className="divide-y divide-border">
                {half.map((row) => (
                  <div
                    key={row.capability}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <span className="text-xs text-foreground/80">{row.capability}</span>
                    <span className="flex items-center gap-1 font-mono text-[11px] text-primary/80">
                      <ChevronRight className="h-3 w-3" />
                      {row.extensionPoint}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
        <p className="mt-2 text-xs text-muted-foreground">
          None of these require changing the Package primitive. That is the test of whether the
          architecture is actually frozen.
        </p>
      </div>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
