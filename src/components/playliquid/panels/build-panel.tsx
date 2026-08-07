"use client";

import { useState, useMemo } from "react";
import {
  useWorldProjects,
  usePackages,
  useCompose,
  useWorldProject,
} from "@/hooks/use-playliquid";
import { usePlayliquid } from "@/lib/playliquid/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Layers3,
  Package as PackageIcon,
  ArrowRight,
  Link2,
  Grid3x3,
  ShieldCheck,
  Hash,
  CheckCircle2,
  AlertTriangle,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import {
  FamilyBadge,
  HashBadge,
  EmptyState,
  StatusBadge,
} from "../primitives";
import type { BuildManifest, WorldBuildRecord } from "@/lib/playliquid/types";

export function BuildPanel() {
  const projects = useWorldProjects();
  const selectedProjectId = usePlayliquid((s) => s.selectedProjectId);
  const selectProject = usePlayliquid((s) => s.selectProject);
  const selectBuild = usePlayliquid((s) => s.selectBuild);
  const setPanel = usePlayliquid((s) => s.setPanel);
  const packages = usePackages();
  const compose = useCompose();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastBuild, setLastBuild] = useState<WorldBuildRecord | null>(null);
  const [unsatisfied, setUnsatisfied] = useState<string[]>([]);

  const activeProjectId = selectedProjectId ?? projects.data?.[0]?.id ?? null;
  const project = useWorldProject(activeProjectId);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(packages.data?.map((p) => p.id) ?? []));
  }
  function clearAll() {
    setSelected(new Set());
  }

  async function runCompose() {
    if (!activeProjectId || selected.size === 0) {
      toast.error("Select a project and at least one package");
      return;
    }
    compose.mutate(
      { worldProjectId: activeProjectId, packageIds: Array.from(selected) },
      {
        onSuccess: (res) => {
          setLastBuild(res.build);
          setUnsatisfied(res.unsatisfied);
          selectBuild(res.build.id);
          toast.success(
            `Composed Build v${res.build.version} · ${res.build.manifest.interfaceConnections.length} contracts wired`
          );
        },
        onError: (e) => toast.error(e.message),
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Project selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Layers3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">World Project</span>
        </div>
        {projects.isLoading || !activeProjectId ? (
          <div className="h-9 flex-1 animate-pulse rounded-md border border-border bg-muted/30" />
        ) : (
          <Select
            value={activeProjectId}
            onValueChange={(v) => { selectProject(v); setSelected(new Set()); setLastBuild(null); }}
          >
            <SelectTrigger className="flex-1 bg-background/60">
              <SelectValue placeholder="Select a world project" />
            </SelectTrigger>
            <SelectContent>
              {projects.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
          </SelectContent>
          </Select>
        )}
      </div>

      {/* Theme summary */}
      {project.data && (
        <Card className="border-border bg-card/40">
          <CardContent className="p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <ThemeField label="Era" value={project.data.theme?.era} />
              <ThemeField label="Art" value={project.data.theme?.artDirection} />
              <ThemeField label="Scale" value={project.data.theme?.scale} />
              <ThemeField label="Materials" value={project.data.theme?.materialLanguage} />
              <ThemeField label="Lighting" value={project.data.theme?.lighting} />
              <ThemeField label="Tech" value={project.data.theme?.technologyLevel} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Package picker + compose */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm">
                <PackageIcon className="h-4 w-4 text-primary" />
                Select Packages to Compose
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 text-xs">
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {packages.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-md bg-muted/30" />
                ))}
              </div>
            ) : (
              <ScrollArea className="max-h-[420px] pr-3 scroll-thin">
                <div className="space-y-1.5">
                  {packages.data?.map((p) => (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-border/60 bg-background/40 p-2.5 transition-colors hover:border-primary/30"
                    >
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggle(p.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{p.displayName}</span>
                          <FamilyBadge family={p.family} />
                        </div>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{p.name}</p>
                      </div>
                      <div className="hidden items-center gap-1 sm:flex">
                        {p.provides.slice(0, 1).map((i) => (
                          <Badge key={i.id} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 px-1 text-[9px] font-mono text-emerald-300">
                            ↑{i.name}
                          </Badge>
                        ))}
                        {p.requires.slice(0, 1).map((i) => (
                          <Badge key={i.id} variant="outline" className="border-amber-500/30 bg-amber-500/10 px-1 text-[9px] font-mono text-amber-300">
                            ↓{i.name}
                          </Badge>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Compose action + result */}
        <div className="space-y-3">
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-semibold text-foreground">{selected.size}</p>
                  <p className="text-xs text-muted-foreground">packages selected</p>
                </div>
                <Workflow className="h-8 w-8 text-primary/60" />
              </div>
              <Button
                className="mt-3 w-full"
                onClick={runCompose}
                disabled={compose.isPending || selected.size === 0 || !activeProjectId}
              >
                {compose.isPending ? "Composing…" : "Compose World Build"}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Resolves dependencies, wires contracts, freezes an immutable build.
              </p>
            </CardContent>
          </Card>

          {lastBuild && (
            <BuildResultCard build={lastBuild} unsatisfied={unsatisfied} onViewRuntime={() => setPanel("runtime")} />
          )}
        </div>
      </div>

      {/* Existing builds for this project */}
      {project.data?.builds && project.data.builds.length > 0 && (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Existing Builds ({project.data.builds.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {project.data.builds.map((b) => (
                <button
                  key={b.id}
                  onClick={() => { setLastBuild(b); selectBuild(b.id); }}
                  className="rounded-md border border-border/60 bg-background/40 p-3 text-left transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">v{b.version}</span>
                    <StatusBadge status={b.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <HashBadge hash={b.hash} />
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {b.packages.length} packages · {b.manifest.interfaceConnections.length} contracts
                  </p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ThemeField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xs text-foreground/90">{value ?? "—"}</dd>
    </div>
  );
}

function BuildResultCard({
  build,
  unsatisfied,
  onViewRuntime,
}: {
  build: WorldBuildRecord;
  unsatisfied: string[];
  onViewRuntime: () => void;
}) {
  const m: BuildManifest = build.manifest;
  return (
    <Card className="border-primary/40 bg-card/60 glow-emerald">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm font-semibold">Build v{build.version}</span>
          </div>
          <StatusBadge status={build.status} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <HashBadge hash={build.hash} label="immutable" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Metric icon={<Link2 className="h-3 w-3" />} label="Contracts" value={m.interfaceConnections.length} />
          <Metric icon={<Grid3x3 className="h-3 w-3" />} label="Spatial" value={m.spatialGraph.length} />
          <Metric icon={<ShieldCheck className="h-3 w-3" />} label="Policies" value={Object.keys(m.capabilityPolicies).length} />
        </div>

        {unsatisfied.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/[0.06] p-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {unsatisfied.length} unsatisfied requirement{unsatisfied.length === 1 ? "" : "s"}
            </div>
            <ul className="mt-1 space-y-0.5">
              {unsatisfied.slice(0, 3).map((u, i) => (
                <li key={i} className="font-mono text-[10px] text-muted-foreground">{u}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={onViewRuntime}>
            <ArrowRight className="mr-1 h-3 w-3" />
            Deploy to Runtime
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2">
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
