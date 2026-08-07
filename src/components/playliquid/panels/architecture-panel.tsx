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
} from "lucide-react";
import { cn } from "@/lib/utils";

const primitiveIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Package: Boxes,
  Specification: FileJson,
  "Interface / Contract": Plug,
  Entity: Box,
  "World Project": Globe,
  "World Build": Layers3,
  Kernel: Cpu,
  "Runtime Adapter": MonitorSmartphone,
  "World Node": Server,
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
            <pre className="font-mono text-[11px] leading-relaxed text-muted-foreground sm:text-xs whitespace-pre">
{`                    PLAYLIQUID OS
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
  SPECIFICATION       PACKAGES          WORLD PROJECT
       │                 │                  │
       └─────────────────┼──────────────────┘
                         │
                    COMPOSITION
                         │
                    WORLD BUILD
                         │
                      ENTITIES
                         │
                       KERNEL
                         │
                   RUNTIME ADAPTER
                         │
                      WORLD NODE`}
            </pre>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Every future capability — multiplayer, VR, smell, federation, photorealism — plugs into this
            graph <span className="text-foreground">without changing what a Package, World, Entity, Specification, Build, or Runtime means.</span>
          </p>
        </CardContent>
      </Card>

      {/* The 9 primitives */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-muted-foreground">The 9 Permanent Contracts</h3>
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
