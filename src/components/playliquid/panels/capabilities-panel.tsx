"use client";

import { useState } from "react";
import {
  usePackages,
  useWorldProjects,
  useNegotiateCapabilities,
} from "@/hooks/use-playliquid";
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
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Layers,
  Zap,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, FamilyBadge } from "../primitives";
import type { EffectiveCapability } from "@/lib/playliquid/types";

export function CapabilitiesPanel() {
  const packages = usePackages("avatar");
  const projects = useWorldProjects();
  const negotiate = useNegotiateCapabilities();

  const [packageId, setPackageId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [zoneName, setZoneName] = useState<string>("");
  const [experienceName, setExperienceName] = useState<string>("");
  const [result, setResult] = useState<{
    package: { name: string; displayName: string; family: string; capabilities: string[] };
    declared: string[];
    effective: EffectiveCapability[];
  } | null>(null);

  function run() {
    if (!packageId || !projectId) {
      toast.error("Select an avatar package and a world project");
      return;
    }
    negotiate.mutate(
      {
        packageId,
        worldProjectId: projectId,
        zoneName: zoneName || undefined,
        experienceName: experienceName || undefined,
      },
      {
        onSuccess: (res) => {
          setResult(res);
          toast.success(`Negotiated ${res.effective.length} capabilities`);
        },
        onError: (e) => toast.error(e.message),
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Explanation card */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Multi-layer Capability Negotiation</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The package declares capabilities. The world layers policies on top. The Kernel computes the
                <span className="text-foreground"> effective</span> result. The package stays reusable across 500 worlds —
                Superman can fly in 500 worlds and be grounded in 501 <span className="text-foreground">without 501 implementations.</span>
              </p>
              <div className="mt-2 font-mono text-[11px] text-muted-foreground">
                entity caps × world policy × zone policy × experience policy = <span className="text-primary">effective</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selector */}
      <Card className="border-border bg-card/40">
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Avatar Package (declares capabilities)</label>
              <Select value={packageId ?? undefined} onValueChange={setPackageId}>
                <SelectTrigger className="bg-background/60">
                  <SelectValue placeholder="Select an avatar…" />
                </SelectTrigger>
                <SelectContent>
                  {packages.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.displayName} ({p.capabilities.length} caps)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">World Project (has policies)</label>
              <Select value={projectId ?? undefined} onValueChange={setProjectId}>
                <SelectTrigger className="bg-background/60">
                  <SelectValue placeholder="Select a world…" />
                </SelectTrigger>
                <SelectContent>
                  {projects.data?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Zone (optional — overrides world)</label>
              <input
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                placeholder="e.g. museum-district"
                className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-1 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Experience (optional — overrides zone)</label>
              <input
                value={experienceName}
                onChange={(e) => setExperienceName(e.target.value)}
                placeholder="e.g. superman-event"
                className="flex h-9 w-full rounded-md border border-input bg-background/60 px-3 py-1 font-mono text-xs"
              />
            </div>
          </div>
          <Button onClick={run} disabled={negotiate.isPending} className="w-full gap-2">
            <Shield className="h-4 w-4" />
            {negotiate.isPending ? "Negotiating…" : "Negotiate Capabilities"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            Try: Superman + Amsterdam (no zone) → flight denied. Add zone <span className="font-mono">museum-district</span> → flight allowed. Add experience <span className="font-mono">superman-event</span> → all powers restored.
          </p>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Package summary */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-primary" />
                {result.package.displayName}
                <FamilyBadge family={result.package.family} />
              </CardTitle>
              <p className="font-mono text-[11px] text-muted-foreground">{result.package.name}</p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {result.declared.map((c) => (
                  <Badge key={c} variant="outline" className="font-mono text-[10px]">
                    {c}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Effective capabilities */}
          <Card className="border-border bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-primary" />
                Effective Capabilities (computed by the Kernel)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.effective.map((ec) => (
                  <CapabilityRow key={ec.capability} ec={ec} />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!result && !negotiate.isPending && (
        <EmptyState>
          <div className="flex flex-col items-center gap-2">
            <Info className="h-6 w-6 text-muted-foreground/50" />
            <p>Select an avatar and world, then negotiate to see the multi-layer result.</p>
          </div>
        </EmptyState>
      )}
    </div>
  );
}

function CapabilityRow({ ec }: { ec: EffectiveCapability }) {
  const icon =
    ec.action === "allow" ? <ShieldCheck className="h-4 w-4 text-emerald-400" /> :
    ec.action === "deny" ? <ShieldX className="h-4 w-4 text-rose-400" /> :
    <ShieldAlert className="h-4 w-4 text-amber-400" />;

  const borderCls =
    ec.action === "allow" ? "border-emerald-500/20 bg-emerald-500/[0.04]" :
    ec.action === "deny" ? "border-rose-500/20 bg-rose-500/[0.04]" :
    "border-amber-500/20 bg-amber-500/[0.04]";

  return (
    <div className={`rounded-md border p-3 ${borderCls}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-mono text-sm font-medium">{ec.capability}</span>
        <Badge
          variant="outline"
          className={
            ec.action === "allow" ? "ml-auto border-emerald-500/30 bg-emerald-500/10 text-emerald-300" :
            ec.action === "deny" ? "ml-auto border-rose-500/30 bg-rose-500/10 text-rose-300" :
            "ml-auto border-amber-500/30 bg-amber-500/10 text-amber-300"
          }
        >
          {ec.action}
        </Badge>
      </div>
      {ec.limitedBy && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {ec.action === "deny" ? "Denied" : "Limited"} by <span className="font-mono text-foreground/70">{ec.limitedBy.layer}</span>
          {ec.limitedBy.rule.reason && ` — ${ec.limitedBy.rule.reason}`}
          {ec.limitedBy.rule.params && (
            <span className="ml-1 font-mono text-foreground/60">{JSON.stringify(ec.limitedBy.rule.params)}</span>
          )}
        </p>
      )}
      {ec.layers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ec.layers.map((l, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] ${
                l.action === "allow" ? "border-emerald-500/20 text-emerald-300/80" :
                l.action === "deny" ? "border-rose-500/20 text-rose-300/80" :
                "border-amber-500/20 text-amber-300/80"
              }`}
            >
              {l.layer}: {l.action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
