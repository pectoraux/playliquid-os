"use client";

import { useState } from "react";
import {
  useWorldProjects,
  useCreateWorldProject,
} from "@/hooks/use-playliquid";
import { usePlayliquid } from "@/lib/playliquid/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Plus, Layers3, Users, ArrowRight, Palette } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, HashBadge } from "../primitives";
import type { WorldProjectRecord } from "@/lib/playliquid/types";

export function WorldsPanel() {
  const { data: projects, isLoading } = useWorldProjects();
  const selectProject = usePlayliquid((s) => s.selectProject);
  const setPanel = usePlayliquid((s) => s.setPanel);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          A World Project is the Git-like collaborative source repository for a World.
        </p>
        <CreateWorldDialog open={open} onOpenChange={setOpen} onCreated={(id) => { selectProject(id); setPanel("build"); }} />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : !projects?.length ? (
        <EmptyState>No world projects yet. Create one to begin composing.</EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {projects.map((p) => (
            <WorldCard
              key={p.id}
              project={p}
              onOpen={() => {
                selectProject(p.id);
                setPanel("build");
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorldCard({ project, onOpen }: { project: WorldProjectRecord; onOpen: () => void }) {
  const builds = project.builds ?? [];
  const latestBuild = builds[0];
  return (
    <Card
      className="group cursor-pointer border-border bg-card/50 transition-all hover:border-primary/40 hover:bg-card/80"
      onClick={onOpen}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-foreground">{project.name}</h4>
              <p className="font-mono text-[11px] text-muted-foreground">{project.slug}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>

        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <Stat icon={<Layers3 className="h-3 w-3" />} label="Builds" value={builds.length} />
          <Stat icon={<Palette className="h-3 w-3" />} label="Era" value={project.theme?.era ?? "—"} />
          <Stat icon={<Users className="h-3 w-3" />} label="Contribs" value={project.contributors?.length ?? 0} />
        </div>

        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {project.theme?.preferredFamilies?.slice(0, 4).map((f) => (
              <Badge key={f} variant="outline" className="font-mono text-[10px] text-foreground/70">
                {f}
              </Badge>
            ))}
            {!project.theme?.preferredFamilies?.length && (
              <span className="text-[11px] text-muted-foreground">no preferred families</span>
            )}
          </div>
        </div>

        {latestBuild && (
          <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
            <HashBadge hash={latestBuild.hash} label="latest build" />
            <Badge variant="outline" className="font-mono text-[10px]">
              v{latestBuild.version}
            </Badge>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {latestBuild.packages?.length ?? 0} packages
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-xs text-foreground/90">{value}</div>
    </div>
  );
}

const ERA_PRESETS = [
  "17th-century",
  "contemporary",
  "cyberpunk-2080",
  "medieval",
  "sci-fi-2200",
  "post-apocalyptic",
];

function CreateWorldDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const create = useCreateWorldProject();
  const [form, setForm] = useState({
    name: "",
    description: "",
    era: "contemporary",
    artDirection: "stylized-realistic",
    coordinateSystem: "cartesian-meters",
  });

  function submit() {
    if (!form.name) {
      toast.error("Name your world project");
      return;
    }
    create.mutate(
      {
        name: form.name,
        description: form.description,
        theme: {
          era: form.era,
          artDirection: form.artDirection,
          scale: "city",
          coordinateSystem: form.coordinateSystem,
          architectureLanguage: "mixed",
          materialLanguage: "mixed",
          lighting: "daylight",
          colorLanguage: "balanced",
          technologyLevel: "modern",
          allowedFamilies: [],
          preferredFamilies: [],
          excludedFamilies: [],
        },
        rules: { gravity: 9.8, dayNightCycle: true, maxAvatars: 64 },
        contributors: ["@you"],
      },
      {
        onSuccess: (project) => {
          toast.success(`World project "${project.name}" created`);
          onOpenChange(false);
          onCreated(project.id);
          setForm({ name: "", description: "", era: "contemporary", artDirection: "stylized-realistic", coordinateSystem: "cartesian-meters" });
        },
        onError: (e) => toast.error(e.message),
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          New World Project
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card/95">
        <DialogHeader>
          <DialogTitle>Create a World Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Cyberpunk Tokyo"
              className="bg-background/60"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="bg-background/60"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Era</Label>
              <SelectEra value={form.era} onChange={(v) => setForm({ ...form, era: v })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Art direction</Label>
              <Input
                value={form.artDirection}
                onChange={(e) => setForm({ ...form, artDirection: e.target.value })}
                className="bg-background/60 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Coord system</Label>
              <Input
                value={form.coordinateSystem}
                onChange={(e) => setForm({ ...form, coordinateSystem: e.target.value })}
                className="bg-background/60 text-xs"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectEra({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {ERA_PRESETS.map((era) => (
        <button
          key={era}
          type="button"
          onClick={() => onChange(era)}
          className={`rounded-md border px-2 py-1 font-mono text-[10px] transition-colors ${
            value === era
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
          }`}
        >
          {era}
        </button>
      ))}
    </div>
  );
}
