"use client";

import { useState } from "react";
import {
  usePackages,
  useCreatePackage,
} from "@/hooks/use-playliquid";
import { usePlayliquid } from "@/lib/playliquid/store";
import type { Family, PackageRecord } from "@/lib/playliquid/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search, Package as PackageIcon, ArrowUpRight, ArrowDownRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  FamilyBadge,
  HashBadge,
  CertBadge,
  EmptyState,
} from "../primitives";

const FAMILIES: Array<{ value: Family | "all"; label: string }> = [
  { value: "all", label: "All families" },
  { value: "avatar", label: "avatar" },
  { value: "building", label: "building" },
  { value: "road", label: "road" },
  { value: "vehicle", label: "vehicle" },
  { value: "physics", label: "physics" },
  { value: "weather", label: "weather" },
  { value: "infrastructure", label: "infrastructure" },
  { value: "sensory", label: "sensory" },
  { value: "renderer", label: "renderer" },
];

export function RegistryPanel() {
  const [family, setFamily] = useState<Family | "all">("all");
  const [q, setQ] = useState("");
  const { data: packages, isLoading } = usePackages(family, q);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PackageRecord | null>(null);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search packages by name, description…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 bg-background/60"
          />
        </div>
        <Select value={family} onValueChange={(v) => setFamily(v as Family | "all")}>
          <SelectTrigger className="w-full sm:w-[180px] bg-background/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FAMILIES.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RegisterPackageDialog open={open} onOpenChange={setOpen} />
      </div>

      {/* Count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {isLoading ? "Loading…" : `${packages?.length ?? 0} package${(packages?.length ?? 0) === 1 ? "" : "s"}`} in the registry
        </span>
        <span className="font-mono">hash · version · provenance</span>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted/30" />
          ))}
        </div>
      ) : !packages?.length ? (
        <EmptyState>No packages match your filter. Register one to seed the registry.</EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} onOpen={() => setSelected(p)} />
          ))}
        </div>
      )}

      {/* Detail drawer */}
      <PackageDetailDialog pkg={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function PackageCard({ pkg, onOpen }: { pkg: PackageRecord; onOpen: () => void }) {
  return (
    <Card
      className="group cursor-pointer border-border bg-card/50 transition-all hover:border-primary/40 hover:bg-card/80"
      onClick={onOpen}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/50 text-muted-foreground group-hover:text-primary">
              <PackageIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-foreground">{pkg.displayName}</h4>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{pkg.name}</p>
            </div>
          </div>
          <FamilyBadge family={pkg.family} />
        </div>
        <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{pkg.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <HashBadge hash={pkg.hash} />
          <span className="font-mono text-[11px] text-muted-foreground">v{pkg.version}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {pkg.provides.slice(0, 2).map((i) => (
            <Badge key={i.id} variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] font-mono text-emerald-300">
              <ArrowUpRight className="h-2.5 w-2.5" />
              {i.name}
            </Badge>
          ))}
          {pkg.requires.slice(0, 2).map((i) => (
            <Badge key={i.id} variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-mono text-amber-300">
              <ArrowDownRight className="h-2.5 w-2.5" />
              {i.name}
            </Badge>
          ))}
          <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            <CertBadge level={pkg.certification.level} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PackageDetailDialog({ pkg, onClose }: { pkg: PackageRecord | null; onClose: () => void }) {
  return (
    <Dialog open={!!pkg} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden bg-card/95">
        {pkg && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PackageIcon className="h-4 w-4 text-primary" />
                {pkg.displayName}
                <FamilyBadge family={pkg.family} />
              </DialogTitle>
              <p className="font-mono text-xs text-muted-foreground">{pkg.name}</p>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4 scroll-thin">
              <div className="space-y-4">
                <p className="text-sm text-foreground/80">{pkg.description}</p>

                <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                  <Field label="Version" value={`v${pkg.version}`} mono />
                  <Field label="License" value={pkg.license} mono />
                  <Field label="Certification" value={pkg.certification.level} mono />
                  <Field label="Generator" value={pkg.provenance.generator} mono />
                </div>

                <div>
                  <HashRow label="Hash" value={pkg.hash} />
                  <HashRow label="Artifact URI" value={pkg.artifactUri ?? "—"} />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h5 className="mb-2 flex items-center gap-1 text-xs font-medium text-emerald-400">
                      <ArrowUpRight className="h-3 w-3" /> Provides ({pkg.provides.length})
                    </h5>
                    <div className="space-y-1.5">
                      {pkg.provides.map((i) => (
                        <div key={i.id} className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-2">
                          <p className="font-mono text-[11px] text-emerald-300">{i.name}</p>
                          <p className="text-[11px] text-muted-foreground">{i.description}</p>
                        </div>
                      ))}
                      {!pkg.provides.length && <p className="text-[11px] text-muted-foreground">none</p>}
                    </div>
                  </div>
                  <div>
                    <h5 className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-400">
                      <ArrowDownRight className="h-3 w-3" /> Requires ({pkg.requires.length})
                    </h5>
                    <div className="space-y-1.5">
                      {pkg.requires.map((i) => (
                        <div key={i.id} className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] p-2">
                          <p className="font-mono text-[11px] text-amber-300">{i.name}</p>
                          <p className="text-[11px] text-muted-foreground">{i.description}</p>
                        </div>
                      ))}
                      {!pkg.requires.length && <p className="text-[11px] text-muted-foreground">none</p>}
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="mb-2 text-xs font-medium text-muted-foreground">Capabilities</h5>
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.capabilities.map((c) => (
                      <Badge key={c} variant="secondary" className="font-mono text-[10px]">
                        {c}
                      </Badge>
                    ))}
                    {!pkg.capabilities.length && <p className="text-[11px] text-muted-foreground">none</p>}
                  </div>
                </div>

                <div>
                  <h5 className="mb-2 text-xs font-medium text-muted-foreground">Canonical Specification (IR)</h5>
                  <pre className="max-h-48 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] text-foreground/80 scroll-thin">
                    {JSON.stringify(pkg.specification, null, 2)}
                  </pre>
                </div>

                <div>
                  <h5 className="mb-2 text-xs font-medium text-muted-foreground">Manifest</h5>
                  <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] text-foreground/80 scroll-thin">
                    {JSON.stringify(pkg.manifest, null, 2)}
                  </pre>
                </div>
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className={mono ? "font-mono text-xs text-foreground/90" : "text-xs text-foreground/90"}>{value}</dd>
    </div>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-border/50 py-1.5 text-xs last:border-0">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-foreground/80">{value}</span>
    </div>
  );
}

function RegisterPackageDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreatePackage();
  const [form, setForm] = useState({
    name: "@you/family/name",
    displayName: "",
    description: "",
    family: "building" as Family,
    provides: "spatial.anchor",
    requires: "",
    capabilities: "renderable",
  });

  function submit() {
    if (!form.name || form.name === "@you/family/name") {
      toast.error("Give the package a scoped name like @you/buildings/tower");
      return;
    }
    create.mutate(
      {
        name: form.name,
        displayName: form.displayName || form.name.split("/").pop()!,
        description: form.description,
        family: form.family,
        provides: parseIfaces(form.provides, "provides"),
        requires: parseIfaces(form.requires, "requires"),
        capabilities: form.capabilities.split(",").map((s) => s.trim()).filter(Boolean),
      },
      {
        onSuccess: () => {
          toast.success("Package registered in the Playliquid Registry");
          onOpenChange(false);
          setForm({
            name: "@you/family/name",
            displayName: "",
            description: "",
            family: "building",
            provides: "spatial.anchor",
            requires: "",
            capabilities: "renderable",
          });
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
          Register Package
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-card/95">
        <DialogHeader>
          <DialogTitle>Register a Package</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Scoped name</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="font-mono bg-background/60"
              placeholder="@you/family/name"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Display name</Label>
              <Input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                className="bg-background/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Family</Label>
              <Select
                value={form.family}
                onValueChange={(v) => setForm({ ...form, family: v as Family })}
              >
                <SelectTrigger className="bg-background/60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAMILIES.filter((f) => f.value !== "all").map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-background/60"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provides (comma-separated)</Label>
              <Input
                value={form.provides}
                onChange={(e) => setForm({ ...form, provides: e.target.value })}
                className="font-mono bg-background/60 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Requires (comma-separated)</Label>
              <Input
                value={form.requires}
                onChange={(e) => setForm({ ...form, requires: e.target.value })}
                className="font-mono bg-background/60 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Capabilities (comma-separated)</Label>
            <Input
              value={form.capabilities}
              onChange={(e) => setForm({ ...form, capabilities: e.target.value })}
              className="font-mono bg-background/60 text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Registering…" : "Register"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parseIfaces(
  raw: string,
  direction: "provides" | "requires"
): Array<{ name: string; family?: string; description?: string }> {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      family: name.split(".")[0] ?? "general",
      description: `${direction} ${name}`,
    }));
}
