"use client";

import { useState, useEffect } from "react";
import {
  useWorldBuilds,
  useWorldNodes,
  useWorldProject,
  useEntities,
  useKernelEvents,
  useStartNode,
  useStopNode,
  useCreateNode,
  useTick,
} from "@/hooks/use-playliquid";
import { usePlayliquid } from "@/lib/playliquid/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Server,
  Play,
  Square,
  Radio,
  Box,
  Activity,
  Zap,
  Cpu,
  Terminal,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import {
  StatusBadge,
  FamilyBadge,
  EmptyState,
  Mono,
} from "../primitives";
import type { NodeHost } from "@/lib/playliquid/types";

const HOSTS: NodeHost[] = ["vercel", "aws", "local", "edge", "cloud"];

export function NodesPanel() {
  const projects = useWorldBuilds();
  const builds = projects.data ?? [];
  const [userBuildId, setUserBuildId] = useState<string | null>(null);
  // derive the effective active build: user choice, else first available
  const activeBuildId = userBuildId ?? builds[0]?.id ?? null;

  const nodes = useWorldNodes(activeBuildId ?? undefined);
  const entities = useEntities(activeBuildId ?? undefined);
  const events = useKernelEvents(60);

  const autoTick = usePlayliquid((s) => s.autoTick);
  const setAutoTick = usePlayliquid((s) => s.setAutoTick);
  const tick = useTick();

  // auto-tick every 4s when enabled
  useEffect(() => {
    if (!autoTick) return;
    const id = setInterval(() => {
      tick.mutate(undefined, { onError: () => {} });
    }, 4000);
    return () => clearInterval(id);
  }, [autoTick, tick]);

  return (
    <div className="space-y-4">
      {/* Build selector + tick controls */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Server className="h-4 w-4 text-primary" />
          {projects.isLoading || !activeBuildId ? (
            <div className="h-9 flex-1 animate-pulse rounded-md border border-border bg-muted/30" />
          ) : (
            <Select value={activeBuildId} onValueChange={setUserBuildId}>
              <SelectTrigger className="flex-1 bg-background/60">
                <SelectValue placeholder="Select a world build" />
              </SelectTrigger>
              <SelectContent>
                {builds.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    Build v{b.version} · {b.hash.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={autoTick} onCheckedChange={setAutoTick} />
            Auto-tick
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => tick.mutate(undefined, { onSuccess: (r) => toast.success(`Scheduler ticked · ${r.count} events`) })}
            disabled={tick.isPending}
            className="gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" />
            Tick Kernel
          </Button>
        </div>
      </div>

      {!activeBuildId ? (
        <EmptyState>No world builds available. Compose one in the Build panel.</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* World Nodes */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-primary" />
                World Nodes
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {nodes.data?.length ?? 0} deployed
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nodes.data?.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No nodes yet. Deploy this build to a host below.
                </p>
              )}
              {nodes.data?.map((n) => (
                <NodeRow key={n.id} node={n} />
              ))}
              <DeployRow buildId={activeBuildId} />
            </CardContent>
          </Card>

          {/* Kernel event bus */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Radio className="h-4 w-4 text-primary animate-pulse" />
                Kernel Event Bus
                <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  live · {events.data?.length ?? 0}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[340px] pr-3 scroll-thin">
                <div className="space-y-1 font-mono text-[11px]">
                  {events.data?.map((ev) => (
                    <div key={ev.id} className="flex items-start gap-2 rounded border border-border/40 bg-background/40 px-2 py-1.5">
                      <span className="shrink-0 text-muted-foreground/60">
                        {new Date(ev.createdAt).toLocaleTimeString([], { hour12: false })}
                      </span>
                      <EventTag type={ev.type} />
                      <span className="truncate text-foreground/70">
                        {summarizePayload(ev.type, ev.payload)}
                      </span>
                    </div>
                  ))}
                  {events.data?.length === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">bus is quiet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Entities */}
          <Card className="border-border bg-card/40 lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Box className="h-4 w-4 text-primary" />
                Entities in this Build
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {entities.data?.length ?? 0} instantiated
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {entities.data?.length === 0 ? (
                <EmptyState>No entities. Start a world node to spawn them.</EmptyState>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {entities.data?.map((e) => (
                    <div
                      key={e.id}
                      className="rounded-md border border-border/60 bg-background/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{e.name}</span>
                        {e.package && <FamilyBadge family={e.package.family} />}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="font-mono text-foreground/70">
                          ({e.position.x.toFixed(1)}, {e.position.y.toFixed(1)}, {e.position.z.toFixed(1)})
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {e.components.map((c) => (
                          <Badge key={c} variant="secondary" className="font-mono text-[9px]">
                            {c}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function NodeRow({ node }: { node: { id: string; host: string; endpoint: string; status: string; startedAt: string | null; health: Record<string, unknown> } }) {
  const start = useStartNode();
  const stop = useStopNode();
  const running = node.status === "running";
  const entities = (node.health as { entities?: number }).entities ?? 0;
  const fps = (node.health as { fps?: number }).fps ?? 0;

  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HostIcon host={node.host} />
          <div>
            <p className="font-mono text-sm font-medium text-foreground">{node.host}</p>
            <p className="font-mono text-[10px] text-muted-foreground">{node.endpoint}</p>
          </div>
        </div>
        <StatusBadge status={node.status} />
      </div>
      {running && (
        <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Box className="h-3 w-3" /> {entities} entities
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" /> {fps} fps
          </span>
          {node.startedAt && (
            <span className="flex items-center gap-1">
              <Cpu className="h-3 w-3" /> up {Math.round((Date.now() - new Date(node.startedAt).getTime()) / 1000)}s
            </span>
          )}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant={running ? "outline" : "default"}
          className="h-7 flex-1 gap-1.5"
          disabled={start.isPending || running}
          onClick={() => start.mutate(node.id, { onSuccess: () => toast.success(`Node starting on ${node.host}`) })}
        >
          <Play className="h-3 w-3" /> Start
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 gap-1.5"
          disabled={stop.isPending || !running}
          onClick={() => stop.mutate(node.id, { onSuccess: () => toast.success(`Node stopped`) })}
        >
          <Square className="h-3 w-3" /> Stop
        </Button>
      </div>
    </div>
  );
}

function DeployRow({ buildId }: { buildId: string }) {
  const create = useCreateNode();
  const [host, setHost] = useState<NodeHost>("local");
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-dashed border-border bg-background/20 p-2">
      <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Deploy to</span>
      <Select value={host} onValueChange={(v) => setHost(v as NodeHost)}>
        <SelectTrigger className="h-7 flex-1 bg-background/60 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {HOSTS.map((h) => (
            <SelectItem key={h} value={h}>{h}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 gap-1.5"
        disabled={create.isPending}
        onClick={() => create.mutate({ worldBuildId: buildId, host }, { onSuccess: () => toast.success(`Deployed a ${host} node`) })}
      >
        Deploy
      </Button>
    </div>
  );
}

function HostIcon({ host }: { host: string }) {
  if (host === "vercel" || host === "aws" || host === "cloud") return <Globe className="h-4 w-4 text-sky-300" />;
  if (host === "edge") return <Radio className="h-4 w-4 text-amber-300" />;
  return <Server className="h-4 w-4 text-zinc-300" />;
}

const eventColors: Record<string, string> = {
  "node.running": "text-emerald-400",
  "node.starting": "text-amber-400",
  "node.stopped": "text-zinc-400",
  "node.created": "text-sky-300",
  "node.heartbeat": "text-teal-300",
  "entity.spawn": "text-violet-300",
  "scheduler.tick": "text-primary",
  "scheduler.idle": "text-muted-foreground",
  "capability.invoke": "text-pink-300",
};

function EventTag({ type }: { type: string }) {
  return (
    <span className={`shrink-0 font-medium ${eventColors[type] ?? "text-foreground/70"}`}>
      {type}
    </span>
  );
}

function summarizePayload(type: string, p: Record<string, unknown>): string {
  if (type === "scheduler.tick") {
    const from = p.from as { x: number; y: number; z: number } | undefined;
    const to = p.to as { x: number; y: number; z: number } | undefined;
    if (from && to) return `→ (${to.x}, ${to.y}, ${to.z})`;
    return JSON.stringify(p).slice(0, 80);
  }
  if (type === "node.running") return `${p.host} · ${p.entities} entities spawned`;
  if (type === "node.heartbeat") return `${p.host} alive`;
  if (type === "entity.spawn") return `entity ${p.name}`;
  return JSON.stringify(p).slice(0, 80);
}
