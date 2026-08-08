"use client";

import { useState, useEffect, useRef } from "react";
import { useGenerate, useWorldProjects, useReuseFirst } from "@/hooks/use-playliquid";
import type { ReusePolicy, ReuseFirstResult } from "@/lib/playliquid/types";
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
  Layers3,
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
  const reuseFirst = useReuseFirst();
  const projects = useWorldProjects();
  const selectPackage = usePlayliquid((s) => s.selectPackage);
  const setPanel = usePlayliquid((s) => s.setPanel);

  const [nl, setNl] = useState("");
  const [family, setFamily] = useState<Family>("building");
  const [projectId, setProjectId] = useState<string>("none");
  const [reusePolicy, setReusePolicy] = useState<ReusePolicy>("prefer-existing");
  const [reuseResult, setReuseResult] = useState<ReuseFirstResult | null>(null);
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
    setReuseResult(null);
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

      {/* Reuse-first resolution — Stage 2 */}
      <Card className="border-border bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Layers3 className="h-4 w-4 text-primary" />
            Reuse-First Resolution
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            The Registry is the shared implementation memory. The second user who wants a castle reuses the first user's — the LLM only generates what's missing.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Reuse policy — reuse without homogenization</label>
            <div className="flex flex-wrap gap-1.5">
              {([
                { v: "reuse-freely", label: "Reuse freely" },
                { v: "prefer-existing", label: "Prefer existing" },
                { v: "approve-only", label: "Approve only" },
                { v: "generate-replacements", label: "Generate replacements" },
                { v: "never-reuse", label: "Never reuse" },
              ] as Array<{ v: ReusePolicy; label: string }>).map((p) => (
                <button
                  key={p.v}
                  onClick={() => setReusePolicy(p.v)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    reusePolicy === p.v
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-background/40 text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={reuseFirst.isPending || !nl.trim()}
            onClick={() => {
              reuseFirst.mutate(
                {
                  naturalLanguage: nl,
                  canonical: { family, name: nl.slice(0, 40), capabilities: [] },
                  worldProjectId: projectId === "none" ? undefined : projectId,
                  policy: reusePolicy,
                },
                {
                  onSuccess: (res) => {
                    setReuseResult(res);
                    toast.success(`Resolved: reuse ${res.reusedCount}, generate ${res.generatedCount}`);
                  },
                  onError: (e) => toast.error(e.message),
                }
              );
            }}
          >
            {reuseFirst.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers3 className="h-4 w-4" />}
            {reuseFirst.isPending ? "Resolving…" : "Resolve against Registry"}
          </Button>

          {reuseResult && (
            <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" /> {reuseResult.reusedCount} reused
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <Sparkles className="h-3 w-3" /> {reuseResult.generatedCount} to generate
                </span>
                <span className="ml-auto font-mono text-[10px] text-muted-foreground">policy: {reuseResult.policy}</span>
              </div>
              <div className="divide-y divide-border/50">
                {reuseResult.decomposition.map((d, i) => (
                  <div key={i} className="py-2">
                    <div className="flex items-center gap-2">
                      {d.action === "reuse" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      <span className="font-mono text-xs text-foreground/80">{d.family}</span>
                      <Badge
                        variant="outline"
                        className={
                          d.action === "reuse"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300"
                            : "border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300"
                        }
                      >
                        {d.action}
                      </Badge>
                      {d.reusedPackage && (
                        <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">{d.reusedPackage.name}</span>
                      )}
                      {d.score && (
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">score {d.score.total}</span>
                      )}
                    </div>
                    {d.score && d.action === "reuse" && (
                      <div className="mt-1 flex flex-wrap gap-1 pl-5">
                        {d.score.capabilityOverlap > 0 && <span className="font-mono text-[9px] text-muted-foreground/70">caps +{d.score.capabilityOverlap}</span>}
                        {d.score.styleCompatibility > 0 && <span className="font-mono text-[9px] text-muted-foreground/70">style +{d.score.styleCompatibility}</span>}
                        {d.score.eraCompatibility > 0 && <span className="font-mono text-[9px] text-muted-foreground/70">era +{d.score.eraCompatibility}</span>}
                        {d.score.certification > 0 && <span className="font-mono text-[9px] text-muted-foreground/70">cert +{d.score.certification}</span>}
                      </div>
                    )}
                    <p className="mt-0.5 pl-5 text-[10px] text-muted-foreground/70">{d.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* ── Phase E: User-Owned LLM Flow ── */}
      <UserOwnedLLMFlow />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PHASE E — USER-OWNED LLM FLOW
// The canonical path: NL → spec → prompt → user's LLM → import →
// certification → RuntimeArtifact → browser execution.
// PlayLiquid never calls an LLM. The user takes the prompt to their
// LLM, generates the implementation, and pastes it back.
// ════════════════════════════════════════════════════════════════

function UserOwnedLLMFlow() {
  const [nl, setNl] = useState("");
  const [family, setFamily] = useState<Family>("building");
  const [step, setStep] = useState<"input" | "prompt-ready" | "import">("input");
  const [specificationId, setSpecificationId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>("");
  const [openTargets, setOpenTargets] = useState<Array<{ name: string; url: string; description: string }>>([]);
  const [artifact, setArtifact] = useState("");
  const [importedPackage, setImportedPackage] = useState<{ packageId: string; packageName: string; hash: string; runtimeArtifactId: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function compilePrompt() {
    if (!nl.trim()) { toast.error("Describe what you want to build"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/llm/compile-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naturalLanguage: nl, worldProjectId: undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSpecificationId(data.specificationId);
      setPrompt(data.prompt);
      setOpenTargets(data.openTargets);
      setStep("prompt-ready");
      toast.success("Prompt compiled — take it to your LLM");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  }

  async function importPackage() {
    if (!specificationId || !artifact.trim()) { toast.error("Paste the LLM's output"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/llm/import-package", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specificationId, artifact, family }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImportedPackage(data);
      setStep("import");
      toast.success(`Package "${data.packageName}" imported + certified as RuntimeArtifact`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally { setLoading(false); }
  }

  return (
    <Card className="border-amber-500/20 bg-amber-500/[0.03]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4 text-amber-400" />
          User-Owned LLM Flow — Phase E
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          PlayLiquid produces a Specification + Prompt. You take it to YOUR LLM (ChatGPT, Claude, Gemini, Z.ai).
          You paste the result back. PlayLiquid certifies it as a RuntimeArtifact and can execute it.
          <span className="text-foreground"> PlayLiquid never calls an LLM.</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {step === "input" && (
          <>
            <Textarea
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              placeholder="e.g. A medieval bakery with a stone oven, wooden counter, and bread displays"
              rows={2}
              className="resize-none bg-background/60"
            />
            <div className="flex gap-2">
              <Select value={family} onValueChange={(v) => setFamily(v as Family)}>
                <SelectTrigger className="w-[120px] bg-background/60 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["building", "avatar", "vehicle", "road", "weather", "physics", "creature", "sensory", "infrastructure"] as Family[]).map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={compilePrompt} disabled={loading} className="flex-1 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                Compile Prompt
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Step 1: PlayLiquid converts your NL → canonical Specification → compiled implementation Prompt.
            </p>
          </>
        )}

        {step === "prompt-ready" && (
          <>
            <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2.5">
              <p className="mb-1 text-[10px] font-semibold uppercase text-amber-400">Step 2: Take this prompt to your LLM</p>
              <div className="flex flex-wrap gap-1.5">
                {openTargets.map((t) => (
                  <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer"
                    className="rounded-md border border-border bg-background/40 px-2 py-1 font-mono text-[10px] text-foreground/70 transition-colors hover:border-amber-500/40 hover:text-amber-300">
                    {t.name} ↗
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] uppercase text-muted-foreground">Compiled Prompt</span>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px]"
                  onClick={() => { navigator.clipboard.writeText(prompt); toast.success("Prompt copied"); }}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
              <ScrollArea className="h-40 rounded-md border border-border bg-background/60 p-2 scroll-thin">
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/70">{prompt}</pre>
              </ScrollArea>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase text-amber-400">Step 3: Paste the LLM's output here</p>
              <Textarea
                value={artifact}
                onChange={(e) => setArtifact(e.target.value)}
                placeholder="Paste the package implementation from your LLM..."
                rows={3}
                className="resize-none bg-background/60 font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep("input")} className="text-xs">Back</Button>
              <Button onClick={importPackage} disabled={loading || !artifact.trim()} className="flex-1 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Import + Certify as RuntimeArtifact
              </Button>
            </div>
          </>
        )}

        {step === "import" && importedPackage && (
          <div className="space-y-3">
            <div className="flex flex-col items-center py-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mt-3 text-base font-semibold">Package Certified + Executable</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono text-foreground/80">{importedPackage.packageName}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <HashBadge hash={importedPackage.hash} />
                <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
                  RuntimeArtifact: playliquid-web
                </Badge>
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
                  provenance: user-owned
                </Badge>
              </div>
              <p className="mt-3 max-w-md text-[11px] text-muted-foreground">
                This package is now in the Registry with a certified RuntimeArtifact.
                It can be composed into a World Build and executed in the browser runtime.
                PlayLiquid did not call any LLM — the implementation came from your LLM.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => {
              setStep("input"); setNl(""); setArtifact(""); setImportedPackage(null); setPrompt("");
            }}>
              Generate another package
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
