"use client";

import { usePlayliquid } from "@/lib/playliquid/store";
import type { PanelId } from "@/lib/playliquid/store";
import { useKernelEvents, usePackages, useWorldNodes } from "@/hooks/use-playliquid";
import { useSessionUser, useSignOut } from "@/hooks/use-auth";
import { AuthGate } from "@/components/auth/auth-gate";
import { ArchitecturePanel } from "@/components/playliquid/panels/architecture-panel";
import { RegistryPanel } from "@/components/playliquid/panels/registry-panel";
import { WorldsPanel } from "@/components/playliquid/panels/worlds-panel";
import { BuildPanel } from "@/components/playliquid/panels/build-panel";
import { RuntimePanel } from "@/components/playliquid/panels/runtime-panel";
import { NodesPanel } from "@/components/playliquid/panels/nodes-panel";
import { ConsolePanel } from "@/components/playliquid/panels/console-panel";
import { CapabilitiesPanel } from "@/components/playliquid/panels/capabilities-panel";
import { ServicesPanel } from "@/components/playliquid/panels/services-panel";
import { ContributionsPanel } from "@/components/playliquid/panels/contributions-panel";
import { AdminPanel } from "@/components/playliquid/panels/admin-panel";
import {
  Droplets,
  Boxes,
  Globe,
  Layers3,
  Server,
  Terminal,
  Sparkles,
  Activity,
  Shield,
  LogOut,
  ChevronDown,
  GitPullRequest,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

const NAV: Array<{ id: PanelId; label: string; icon: React.ComponentType<{ className?: string }>; desc: string; adminOnly?: boolean }> = [
  { id: "architecture", label: "Architecture", icon: Boxes, desc: "The frozen 10 primitives" },
  { id: "registry", label: "Registry", icon: Layers3, desc: "Packages — everything is one" },
  { id: "worlds", label: "Worlds", icon: Globe, desc: "World Projects" },
  { id: "build", label: "Build", icon: Sparkles, desc: "Compose a World Build" },
  { id: "capabilities", label: "Capabilities", icon: Shield, desc: "Multi-layer negotiation (Superman)" },
  { id: "runtime", label: "Runtime", icon: Monitor, desc: "Browser-native world runtime" },
  { id: "nodes", label: "Nodes", icon: Server, desc: "World Nodes · Kernel · Events" },
  { id: "services", label: "Services", icon: Shield, desc: "OS substrate — never LLM" },
  { id: "contributions", label: "Contributions", icon: GitPullRequest, desc: "GitHub for Worlds" },
  { id: "console", label: "Console", icon: Terminal, desc: "Natural language → Package" },
  { id: "admin", label: "Admin", icon: Shield, desc: "Waitlist approvals", adminOnly: true },
];

export default function Home() {
  return (
    <AuthGate>
      <Console />
    </AuthGate>
  );
}

function Console() {
  const panel = usePlayliquid((s) => s.panel);
  const setPanel = usePlayliquid((s) => s.setPanel);
  const events = useKernelEvents(20);
  const packages = usePackages();
  const nodes = useWorldNodes();
  const { data: sessionData } = useSessionUser();
  const user = sessionData?.user;
  const isAdmin = user?.role === "ADMIN";
  const isDemo = !!user?.email?.endsWith("@playliquid.os");

  const runningNodes = nodes.data?.filter((n) => n.status === "running").length ?? 0;
  const latestEvent = events.data?.[0];
  const activeNav = NAV.find((n) => n.id === panel);

  const visibleNav = NAV.filter((n) => !n.adminOnly || isAdmin);

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

          <UserMenu />
        </div>
      </header>

      {/* Body: sidebar + main */}
      <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="sticky top-14 z-20 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:static lg:top-auto lg:z-auto lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:bg-sidebar/30 lg:backdrop-blur-none">
          <nav className="flex gap-1 overflow-x-auto p-3 lg:flex-col lg:overflow-visible">
            {visibleNav.map((item) => {
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
                    <div className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                      {item.label}
                      {item.adminOnly && (
                        <Shield className="h-2.5 w-2.5 text-amber-400" />
                      )}
                    </div>
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
          {panel === "capabilities" && <CapabilitiesPanel />}
          {panel === "runtime" && <RuntimePanel />}
          {panel === "nodes" && <NodesPanel />}
          {panel === "services" && <ServicesPanel />}
          {panel === "contributions" && <ContributionsPanel />}
          {panel === "console" && <ConsolePanel />}
          {panel === "admin" && isAdmin && <AdminPanel />}
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
            <span>10 primitives</span>
            <span className="text-border">·</span>
            <span>2 pipelines</span>
            <span className="text-border">·</span>
            <span>4 laws</span>
            <span className="text-border">·</span>
            <span className="text-primary">nothing bypasses Package</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function UserMenu() {
  const { data } = useSessionUser();
  const signOut = useSignOut();
  const user = data?.user;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  const initials = (user.name ?? user.email ?? "?").slice(0, 1).toUpperCase();
  const isDemo = !!user.email?.endsWith("@playliquid.os");

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2 py-1.5 transition-colors hover:bg-muted/50"
      >
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 font-mono text-xs font-semibold text-primary">
          {initials}
        </div>
        <div className="hidden text-left sm:block">
          <div className="flex items-center gap-1.5 text-xs font-medium leading-none">
            {user.name ?? user.email}
            {isDemo && (
              <Badge variant="outline" className="h-3.5 px-1 text-[8px] uppercase text-amber-300 border-amber-500/30 bg-amber-500/10">
                demo
              </Badge>
            )}
          </div>
          <div className="font-mono text-[9px] text-muted-foreground">{user.role}</div>
        </div>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          <div className="border-b border-border px-2 py-1.5">
            <p className="truncate text-xs font-medium">{user.name ?? "User"}</p>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{user.email}</p>
            <div className="mt-1 flex gap-1">
              <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase">{user.role}</Badge>
              {isDemo && (
                <Badge variant="outline" className="h-4 px-1 text-[9px] uppercase text-amber-300 border-amber-500/30 bg-amber-500/10">demo</Badge>
              )}
            </div>
          </div>
          <button
            onClick={() => signOut.mutate()}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted/50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      )}
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
