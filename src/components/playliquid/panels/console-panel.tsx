"use client";

import { useState, useEffect, useRef } from "react";
import { useGenerate, useWorldProjects } from "@/hooks/use-playliquid";
import { usePlayliquid } from "@/lib/playliquid/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  FileJson,
  Workflow,
  Cpu,
  ShieldCheck,
  Package as PackageIcon,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Terminal,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { FamilyBadge, HashBadge } from "../primitives";
import type { Family, PackageRecord } from "@/lib/playliquid/types";

const PIPELINE_STAGES = [
  { id: "specifying", label: "AI Architect → Canonical Specification", icon: FileJson },
  { id: "prompting", label: "Prompt Compiler → Implementation Request", icon: Workflow },
  { id: "generating", label: "User's LLM → Package Artifact", icon: Cpu },
  { id: "certifying", label: "Certification → Registry", icon: ShieldCheck },
] as const;

const FAMILIES: Family[] = [
  "building",
  "avatar",
  "vehicle",
  "road",
  "weather",
  "physics",
  "creature",
  "sensory",
  "renderer",
  "infrastructure",
];

const EXAMPLES = [
  "A narrow 5-story Amsterdam canal house with a gabled roof and large windows facing the water",
  "An avatar that walks in first person and can interact with doors and objects",
  "A cobblestone road segment that connects to other road segments and is walkable",
  "A soft overcast sky with drifting clouds and occasional light drizzle",
  "A simple rigid-body physics system providing gravity and collision for the world",
];

export function ConsolePanel() {
  const generate = useGenerate();
  const projects = useWorldProjects();
  const selectPackage = usePlayliquid((s) => s.selectPackage);
  const setPanel = usePlayliquid((s) => s.setPanel);

  const [nl, setNl] = useState("");
  const [family, setFamily] = useState<Family>("building");
  const [projectId, setProjectId] = useState<string>("none");
  const [stage, setStage] = useState<number>(-1);
  const [result, setResult] = useState<{
    specification: Record<string, unknown>;
    prompt: string;
    pkg: PackageRecord | null;
  } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  function run() {
    if (!nl.trim()) {
      toast.error("Describe what you want to build");
      return;
    }
    setResult(null);
    setStage(0);

    // animate the staged reveal while the real pipeline runs server-side
    [400, 900, 1500].forEach((delay, i) => {
      timers.current.push(setTimeout(() => setStage(i + 1), delay));
    });

    generate.mutate(
      {
        naturalLanguage: nl,
        family,
        worldProjectId: projectId === "none" ? undefined : projectId,
      },
      {
        onSuccess: (res) => {
          timers.current.push(setTimeout(() => {
            setStage(PIPELINE_STAGES.length);
            setResult({ specification: res.specification, prompt: res.prompt, pkg: res.package });
            toast.success("Package generated and registered");
          }, 2100));
        },
        onError: (e) => {
          setStage(-1);
          toast.error(e.message);
        },
      }
    );
  }

  const running = generate.isPending || (stage >= 0 && stage < PIPELINE_STAGES.length);

  return (
    <div className="space-y-4">
      {/* Input */}
      <Card className="border-primary/30 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            Natural Language → Package
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Describe what you want. Playliquid converts it to a canonical Specification, compiles a
            precise implementation request, and your LLM produces a Package — registered in the Registry.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            placeholder="e.g. A narrow 5-story Amsterdam canal house with a gabled roof…"
            rows={3}
            className="resize-none bg-background/60"
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground">Package family</label>
              <Select value={family} onValueChange={(v) => setFamily(v as Family)}>
                <SelectTrigger className="bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAMILIES.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs text-muted-foreground">World project (for theme coherence)</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— none —</SelectItem>
                  {projects.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={running} className="gap-2 sm:self-end">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {running ? "Generating…" : "Generate Package"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-muted-foreground">try:</span>
            {EXAMPLES.slice(0, 3).map((ex) => (
              <button
                key={ex}
                onClick={() => setNl(ex)}
                className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex.length > 48 ? ex.slice(0, 48) + "…" : ex}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pipeline stages */}
      {stage >= 0 && (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Workflow className="h-4 w-4 text-primary" />
              Generation Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {PIPELINE_STAGES.map((s, i) => {
                const done = i < stage;
                const active = i === stage;
                const Icon = s.icon;
                return (
                  <div
                    key={s.id}
                    className={`relative rounded-md border p-3 transition-colors ${
                      done
                        ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                        : active
                        ? "border-primary/40 bg-primary/[0.06]"
                        : "border-border bg-background/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={`h-4 w-4 ${done ? "text-emerald-400" : active ? "text-primary" : "text-muted-foreground"}`} />
                      {done ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : active ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                      ) : (
                        <span className="font-mono text-[10px] text-muted-foreground/50">{i + 1}</span>
                      )}
                    </div>
                    <p className={`mt-2 text-[11px] font-medium ${done || active ? "text-foreground" : "text-muted-foreground"}`}>
                      {s.label}
                    </p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Specification */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileJson className="h-4 w-4 text-primary" />
                Canonical Specification
              </CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] text-foreground/80 scroll-thin">
                {JSON.stringify(result.specification, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* Compiled prompt */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Terminal className="h-4 w-4 text-primary" />
                  Compiled Implementation Prompt
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => { navigator.clipboard.writeText(result.prompt); toast.success("Prompt copied"); }}
                >
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-72 pr-3 scroll-thin">
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/70">
                  {result.prompt}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Resulting package */}
          {result.pkg && (
            <Card className="border-primary/40 bg-card/60 glow-emerald lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <PackageIcon className="h-4 w-4 text-primary" />
                  Generated Package
                  <Badge variant="outline" className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                    registered
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                      <PackageIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold">{result.pkg.displayName}</h4>
                      <p className="font-mono text-[11px] text-muted-foreground">{result.pkg.name}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <FamilyBadge family={result.pkg.family} />
                    <HashBadge hash={result.pkg.hash} />
                    <Badge variant="outline" className="font-mono text-[10px]">v{result.pkg.version}</Badge>
                    <span className="text-[11px] text-muted-foreground">by {result.pkg.provenance.llmProvider}</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{result.pkg.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.pkg.provides.map((i) => (
                    <Badge key={i.id} variant="outline" className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] text-emerald-300">
                      ↑ {i.name}
                    </Badge>
                  ))}
                  {result.pkg.requires.map((i) => (
                    <Badge key={i.id} variant="outline" className="border-amber-500/30 bg-amber-500/10 font-mono text-[10px] text-amber-300">
                      ↓ {i.name}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { selectPackage(result.pkg!.id); setPanel("registry"); }}
                    className="gap-1.5"
                  >
                    View in Registry
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setPanel("build"); }}
                    className="gap-1.5"
                  >
                    Compose into World
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
