"use client";

import { cn } from "@/lib/utils";
import type { NodeStatus } from "@/lib/playliquid/types";

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs", className)}>{children}</span>;
}

export function HashBadge({ hash, label }: { hash: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      {label && <span className="text-muted-foreground/70">{label}</span>}
      <span className="text-foreground/80">{hash.slice(0, 12)}</span>
    </span>
  );
}

const statusStyles: Record<string, string> = {
  running: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  composed: "bg-teal-500/15 text-teal-300 border-teal-500/30",
  starting: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  stopped: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  error: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export function StatusBadge({ status }: { status: NodeStatus | string }) {
  const cls = statusStyles[status] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "running" || status === "ready" ? "bg-emerald-400 animate-pulse" : "bg-current")} />
      {status}
    </span>
  );
}

const certStyles: Record<string, string> = {
  certified: "text-emerald-400",
  verified: "text-teal-300",
  basic: "text-amber-400",
  none: "text-zinc-500",
};

export function CertBadge({ level }: { level: string }) {
  return (
    <span className={cn("font-mono text-[11px] font-medium", certStyles[level] ?? certStyles.none)}>
      {level}
    </span>
  );
}

const familyColors: Record<string, string> = {
  avatar: "text-violet-300 border-violet-500/30 bg-violet-500/10",
  building: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  road: "text-stone-300 border-stone-500/30 bg-stone-500/10",
  vehicle: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  creature: "text-rose-300 border-rose-500/30 bg-rose-500/10",
  physics: "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
  weather: "text-blue-300 border-blue-500/30 bg-blue-500/10",
  economy: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  audio: "text-fuchsia-300 border-fuchsia-500/30 bg-fuchsia-500/10",
  ai: "text-pink-300 border-pink-500/30 bg-pink-500/10",
  knowledge: "text-indigo-300 border-indigo-500/30 bg-indigo-500/10",
  sensor: "text-lime-300 border-lime-500/30 bg-lime-500/10",
  sensory: "text-lime-300 border-lime-500/30 bg-lime-500/10",
  renderer: "text-teal-300 border-teal-500/30 bg-teal-500/10",
  input: "text-orange-300 border-orange-500/30 bg-orange-500/10",
  infrastructure: "text-zinc-300 border-zinc-500/30 bg-zinc-500/10",
};

export function FamilyBadge({ family }: { family: string }) {
  const cls = familyColors[family] ?? "text-zinc-300 border-zinc-500/30 bg-zinc-500/10";
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide", cls)}>
      {family}
    </span>
  );
}

export function SectionTitle({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{children}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
