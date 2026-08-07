"use client";

import { usePlayliquid } from "@/lib/playliquid/store";
import type { PanelId } from "@/lib/playliquid/store";
import { useKernelEvents, usePackages, useWorldNodes } from "@/hooks/use-playliquid";
import { ArchitecturePanel } from "@/components/playliquid/panels/architecture-panel";
import { RegistryPanel } from "@/components/playliquid/panels/registry-panel";
import { WorldsPanel } from "@/components/playliquid/panels/worlds-panel";
import { BuildPanel } from "@/components/playliquid/panels/build-panel";
import { RuntimePanel } from "@/components/playliquid/panels/runtime-panel";
import { ConsolePanel } from "@/components/playliquid/panels/console-panel";
import { Droplets, Boxes, Globe, Layers3, Server, Terminal, Sparkles, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: Array<{ id: PanelId; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = [
  { id: "architecture", label: "Architecture", icon: Boxes, desc: "The frozen 9 primitives" },
  { id: "registry", label: "Registry", icon: Layers3, desc: "Packages — everything is one" },
  { id: "worlds", label: "Worlds", icon: Globe, desc: "World Projects" },
  { id: "build", label: "Build", icon: Sparkles, desc: "Compose a World Build" },
  { id: "runtime", label: "Runtime", icon: Server, desc: "Nodes · Entities · Kernel" },
  { id: "console", label: "Console", icon: Terminal, desc: "Natural language → Package" },
];

export default function Home() {
  const panel = usePlayliquid((s) => s.panel);
  const setPanel = usePlayliquid((s) => s.setPanel);
  const events = useKernelEvents(20);
  const packages = usePackages();
  const nodes = useWorldNodes();

  const runningNodes = nodes.data?.filter((n) => n.status === "running").length ?? 0;
  const latestEvent = events.data?.[0];
  const activeNav = NAV.find((n) => n.id === panel);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Droplets className="h-4 w-4" />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
            </div>
            <div className="leading-none">
              <h1 className="text-sm font-semibold tracking-tight">Playliquid OS</h1>
              <p className="font-mono text-[10px] text-muted-foreground">v0.1 · frozen kernel</p>
            </div>
          </div>

          {/* Live status pills */}
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <StatusPill icon={<Layers3 className="h-3 w-3" />} label="packages" value={packages.data?.length ?? 0} />
            <StatusPill icon={<Server className="h-3 w-3" />} label="nodes running" value={runningNodes} accent="emerald" />
            <StatusPill
              icon={<Activity className="h-3 w-3" />}
              label="last event"
              value={latestEvent ? new Date(latestEvent.createdAt).toLocaleTimeString([], { hour12: false }) : "—"}
              mono
            />
          </div>
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="sticky top-14 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:static lg:top-auto lg:z-auto lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-sidebar/30 lg:backdrop-blur-none">
          <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = panel === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setPanel(item.id)}
                  className={cn(
                    "group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors lg:w-full",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                  <div className="hidden lg:block">
                    <div className="text-sm font-medium leading-tight">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                  </div>
                  <span className="lg:hidden text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{activeNav?.label}</h2>
              <p className="text-xs text-muted-foreground">{activeNav?.desc}</p>
            </div>
          </div>
          {panel === "architecture" && <ArchitecturePanel />}
          {panel === "registry" && <RegistryPanel />}
          {panel === "worlds" && <WorldsPanel />}
          {panel === "build" && <BuildPanel />}
          {panel === "runtime" && <RuntimePanel />}
          {panel === "console" && <ConsolePanel />}
        </main>
      </div>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Droplets className="h-3 w-3 text-primary" />
            <span>
              Playliquid OS — <span className="text-foreground/70">a frozen kernel for virtual worlds.</span>
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span>9 primitives</span>
            <span className="text-border">·</span>
            <span>2 pipelines</span>
            <span className="text-border">·</span>
            <span>3 laws</span>
            <span className="text-border">·</span>
            <span className="text-primary">nothing bypasses Package</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatusPill({
  icon,
  label,
  value,
  mono,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  accent?: "emerald";
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
      <span className={cn("text-muted-foreground", accent === "emerald" && "text-emerald-400")}>{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-foreground/90", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}
