"use client";

import { useWorldProjects, useWorldServices, useArchitecture } from "@/hooks/use-playliquid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Server,
  Network,
  Database,
  Radio,
  Mic,
  Megaphone,
  Coins,
  Shield,
  Cpu,
  Layers,
  Lock,
} from "lucide-react";
import { EmptyState } from "../primitives";
import type { WorldServiceRecord } from "@/lib/playliquid/types";

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  networking: Network,
  persistence: Database,
  streaming: Radio,
  voice: Mic,
  ads: Megaphone,
  economy: Coins,
  identity: Shield,
  analytics: Cpu,
  moderation: Lock,
  storage: Database,
};

export function ServicesPanel() {
  const { data: services, isLoading } = useWorldServices();
  const { data: arch } = useArchitecture();

  return (
    <div className="space-y-4">
      {/* OS substrate explanation */}
      <Card className="border-amber-500/20 bg-amber-500/[0.03]">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <h3 className="text-sm font-semibold">OS Substrate — never LLM-generated</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                These services are <span className="text-foreground">provided by PlayLiquid</span>. Packages <span className="text-foreground">consume</span> them through Contracts.
                The user's LLM implements <span className="text-foreground">packages</span> (castles, avatars, weather) — never the OS substrate (multiplayer, replication, streaming, persistence).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : !services?.length ? (
        <EmptyState>No world services registered.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <ServiceCard key={s.id} svc={s} />
          ))}
        </div>
      )}

      {/* Substrate Guarantees — the 11 platform promises */}
      {arch?.substrateGuarantees && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Stage 1 — The 11 Universal Substrate Guarantees
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            PlayLiquid provides these. Packages <span className="text-foreground">consume</span> them through Contracts. The LLM <span className="text-foreground">never</span> implements them.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {arch.substrateGuarantees.map((g) => (
              <div key={g.contract} className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="text-xs font-semibold text-foreground">{g.name}</span>
                </div>
                <Badge variant="outline" className="mt-1.5 font-mono text-[9px] text-emerald-300/70">{g.contract}</Badge>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{g.guarantee}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The distinction table */}
      <Card className="border-border bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers className="h-4 w-4 text-primary" />
            The Critical Distinction
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <Shield className="h-3.5 w-3.5" />
                PlayLiquid OS provides
              </h4>
              <ul className="space-y-1 text-xs text-foreground/80">
                {[
                  "Specification system & Registry",
                  "Composition & World Builds",
                  "Scheduler & Event Bus",
                  "Networking & Multiplayer / Replication",
                  "Spatial partitioning & Streaming",
                  "Persistence",
                  "Capability enforcement (multi-layer)",
                  "World hosting (World Nodes)",
                  "Platform services (below)",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-1.5">
                    <span className="text-emerald-400">▸</span> {x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-md border border-violet-500/20 bg-violet-500/[0.04] p-4">
              <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-violet-400">
                <Cpu className="h-3.5 w-3.5" />
                User's LLM implements
              </h4>
              <ul className="space-y-1 text-xs text-foreground/80">
                {[
                  "Castles, houses, roads, trees",
                  "Avatars, creatures, NPCs, vehicles",
                  "Weather systems, economies, quests",
                  "Museums, schools, Mars rovers",
                  "World-specific visual style & architecture",
                  "Domain logic that consumes OS contracts",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-1.5">
                    <span className="text-violet-400">▸</span> {x}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ServiceCard({ svc }: { svc: WorldServiceRecord }) {
  const Icon = categoryIcons[svc.category] ?? Server;
  const statusCls: Record<string, string> = {
    "contract-only": "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
    simulator: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    partial: "border-sky-500/30 bg-sky-500/10 text-sky-300",
    production: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  };
  const statusLabel: Record<string, string> = {
    "contract-only": "contract only",
    simulator: "simulator",
    partial: "partial",
    production: "production",
  };
  const implStatus = svc.implementationStatus ?? "contract-only";
  return (
    <Card className="border-border bg-card/50 transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <Badge variant="outline" className={`font-mono text-[9px] uppercase ${statusCls[implStatus] ?? statusCls["contract-only"]}`}>
            {statusLabel[implStatus] ?? implStatus}
          </Badge>
        </div>
        <h4 className="mt-3 text-sm font-semibold">{svc.displayName}</h4>
        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{svc.description}</p>
        {svc.implementationNote && (
          <p className="mt-2 rounded border border-amber-500/20 bg-amber-500/[0.04] p-1.5 text-[10px] leading-relaxed text-amber-200/70">
            {svc.implementationNote}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{svc.name}</span>
          <Badge variant="outline" className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
            {svc.provider}
          </Badge>
        </div>
        {svc.contract && typeof svc.contract === "object" && "provides" in svc.contract && (
          <div className="mt-2 flex flex-wrap gap-1">
            {((svc.contract as { provides: string[] }).provides).map((c) => (
              <Badge key={c} variant="secondary" className="font-mono text-[9px]">
                {c}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
