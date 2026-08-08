"use client";

import { useState } from "react";
import { useWorldBuilds } from "@/hooks/use-playliquid";
import { usePlayliquid } from "@/lib/playliquid/store";
import { BrowserRuntime } from "@/components/playliquid/browser-runtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, Cpu, AlertCircle } from "lucide-react";

export function RuntimePanel() {
  const builds = useWorldBuilds();
  const [userBuildId, setUserBuildId] = useState<string | null>(null);
  const activeBuildId = userBuildId ?? builds.data?.[0]?.id ?? null;

  return (
    <div className="space-y-4">
      {/* Build selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">World Build</span>
        </div>
        {builds.isLoading ? (
          <div className="h-9 flex-1 animate-pulse rounded-md border border-border bg-muted/30" />
        ) : builds.data && builds.data.length > 0 ? (
          <Select value={activeBuildId ?? undefined} onValueChange={setUserBuildId}>
            <SelectTrigger className="flex-1 bg-background/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {builds.data.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  Build v{b.version} · {b.hash.slice(0, 8)} · {b.packages.length} packages
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex flex-1 items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2 text-xs text-amber-300">
            <AlertCircle className="h-3.5 w-3.5" />
            No World Builds available. Compose one in the Build panel.
          </div>
        )}
      </div>

      {/* Native Runtime Law banner */}
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Native Runtime Law:</span> Every certified World Build has a defined execution path through a PlayLiquid Runtime Adapter.
              The canonical target is <span className="text-foreground">browser/mobile-native</span>; external engines are optional adapters.
              <span className="ml-1 text-foreground">The engine is an implementation detail; the world is not.</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* The actual browser runtime */}
      <BrowserRuntime buildId={activeBuildId} />
    </div>
  );
}
