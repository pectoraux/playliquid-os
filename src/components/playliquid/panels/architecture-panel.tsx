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
  Radio,
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

      {/* Substrate Guarantees (Stage 1) */}
      {arch.substrateGuarantees && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">
            Stage 1 — Universal Substrate Guarantees
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            PlayLiquid provides these. Packages <span className="text-foreground">consume</span> them. The LLM <span className="text-foreground">never</span> implements them.
            Each is honestly labeled: <span className="text-zinc-400">contract-only</span>, <span className="text-amber-300">simulator</span>, <span className="text-sky-300">partial</span>, or <span className="text-emerald-300">production</span>.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {arch.substrateGuarantees.map((g) => {
              const statusCls: Record<string, string> = {
                "contract-only": "border-zinc-500/20 bg-zinc-500/[0.04] text-zinc-400",
                simulator: "border-amber-500/20 bg-amber-500/[0.04] text-amber-300",
                partial: "border-sky-500/20 bg-sky-500/[0.04] text-sky-300",
                production: "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-300",
              };
              const impl = g.implementationStatus ?? "contract-only";
              return (
                <div key={g.contract} className={`rounded-md border p-3 ${statusCls[impl] ?? statusCls["contract-only"]}`}>
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">{g.name}</span>
                    <Badge variant="outline" className="ml-auto font-mono text-[9px] opacity-70">{g.contract}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{g.guarantee}</p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className={`font-mono text-[9px] uppercase ${statusCls[impl]?.split(" ").find((c) => c.startsWith("text")) ?? "text-zinc-400"}`}>{impl}</span>
                    {g.note && <span className="text-[9px] text-muted-foreground/60">— {g.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Operational Test */}
      {arch.operationalTest && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Scale className="h-4 w-4 text-primary" />
              The Operational Test
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 rounded-md border border-primary/20 bg-primary/[0.04] p-3 text-sm font-medium text-foreground">
              "{arch.operationalTest.rule}"
            </p>
            <div className="divide-y divide-border">
              {arch.operationalTest.examples.map((ex) => {
                const isOS = ex.belongs !== "Package";
                return (
                  <div key={ex.capability} className="flex items-center gap-3 py-2">
                    <span className="w-40 shrink-0 text-xs font-medium text-foreground/80">{ex.capability}</span>
                    <Badge
                      variant="outline"
                      className={
                        isOS
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-violet-500/30 bg-violet-500/10 text-violet-300"
                      }
                    >
                      {ex.belongs}
                    </Badge>
                    <span className="flex-1 text-[11px] text-muted-foreground">{ex.reason}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* PlayLiquid Protocol */}
      {arch.playliquidProtocol && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Radio className="h-4 w-4 text-primary" />
              The PlayLiquid Protocol — Cross-Engine World Interoperability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">{arch.playliquidProtocol.description}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {arch.playliquidProtocol.layers.map((l) => (
                <div key={l.contract} className="rounded-md border border-border/60 bg-background/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{l.name}</span>
                    <Badge variant="outline" className="ml-auto font-mono text-[9px] text-primary/70">{l.contract}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{l.role}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Capability Matrix */}
      {arch.capabilityMatrix && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Capability Matrix — OS vs Engine
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            The engine is an implementation detail. <span className="text-emerald-300">Green = PlayLiquid OS</span> (never engine); <span className="text-muted-foreground">gray = engine-specific</span>.
          </p>
          <Card className="overflow-hidden border-border bg-card/40">
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="p-2 text-left font-medium text-muted-foreground">Capability</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Web</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Mobile</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Unity</th>
                    <th className="p-2 text-left font-medium text-muted-foreground">Unreal</th>
                  </tr>
                </thead>
                <tbody>
                  {arch.capabilityMatrix.map((row) => (
                    <tr key={row.capability} className="border-b border-border/40">
                      <td className="p-2 font-medium text-foreground/80">{row.capability}</td>
                      {[row.nativeWeb, row.mobile, row.unity, row.unreal].map((val, i) => (
                        <td key={i} className="p-2">
                          <span className={`font-mono text-[10px] ${row.osOwned ? "text-emerald-300" : "text-muted-foreground"}`}>
                            {val}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Runtime Targets */}
      {arch.runtimeTargets && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Runtime Targets</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {arch.runtimeTargets.map((t) => {
              const statusCls: Record<string, string> = {
                "in-progress": "border-amber-500/30 bg-amber-500/10 text-amber-300",
                planned: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
                production: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              };
              return (
                <div key={t.target} className="rounded-md border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{t.name}</span>
                    <Badge variant="outline" className={`text-[9px] uppercase ${statusCls[t.status] ?? statusCls.planned}`}>{t.status}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">target: {t.target}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{t.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Roadmap */}
      {arch.roadmap && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Seven-Stage Roadmap</h3>
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
