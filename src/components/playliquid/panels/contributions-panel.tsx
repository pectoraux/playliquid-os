"use client";

import { useState } from "react";
import {
  useContributions,
  useMergeContribution,
  useRejectContribution,
  useWorldProjects,
  useSpatialSlots,
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
  GitPullRequest,
  GitMerge,
  X,
  MapPin,
  Clock,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, FamilyBadge } from "../primitives";
import type { ContributionRecord } from "@/lib/playliquid/types";

export function ContributionsPanel() {
  const projects = useWorldProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const activeProjectId = projectId ?? projects.data?.[0]?.id ?? null;
  const { data: contributions, isLoading } = useContributions(activeProjectId ?? undefined);
  const { data: slots } = useSpatialSlots(activeProjectId ?? undefined);
  const merge = useMergeContribution();
  const reject = useRejectContribution();

  const pending = (contributions ?? []).filter((c) => c.status === "PENDING");
  const reviewed = (contributions ?? []).filter((c) => c.status !== "PENDING");

  function doMerge(c: ContributionRecord) {
    merge.mutate(c.id, {
      onSuccess: () => toast.success(`Merged "${c.title}" — package bound to the world`),
      onError: (e) => toast.error(e.message),
    });
  }
  function doReject(c: ContributionRecord) {
    reject.mutate(
      { id: c.id },
      {
        onSuccess: () => toast.success(`Rejected "${c.title}"`),
        onError: (e) => toast.error(e.message),
      }
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/[0.03]">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <GitPullRequest className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">World Projects as GitHub for Worlds</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Contributors propose <span className="text-foreground">packages</span> to a World Project — not arbitrary code.
                Each contribution targets a <span className="text-foreground">spatial slot</span> and declares contracts.
                Maintainers review and merge (binds the package) or reject.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Select value={activeProjectId ?? undefined} onValueChange={setProjectId}>
          <SelectTrigger className="flex-1 bg-background/60">
            <SelectValue placeholder="Select a world project" />
          </SelectTrigger>
          <SelectContent>
            {projects.data?.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Spatial slots */}
      {slots && slots.length > 0 && (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              Spatial Slots (attachment API)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <div key={s.id} className="rounded-md border border-border/60 bg-background/40 p-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{s.displayName}</span>
                    <Badge variant="outline" className="font-mono text-[9px]">{s.slotType}</Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.acceptedFamilies.map((f) => (
                      <FamilyBadge key={f} family={f} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending contributions */}
      <Card className="border-border bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-amber-400" />
            Pending Contributions ({pending.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pending.length === 0 ? (
            <EmptyState>No pending contributions.</EmptyState>
          ) : (
            <div className="space-y-2">
              {pending.map((c) => (
                <ContributionRow key={c.id} c={c} onMerge={() => doMerge(c)} onReject={() => doReject(c)} mergePending={merge.isPending} rejectPending={reject.isPending} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reviewed */}
      {reviewed.length > 0 && (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Reviewed ({reviewed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[260px] pr-3 scroll-thin">
              <div className="space-y-1.5">
                {reviewed.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-md border border-border/40 bg-background/30 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs">{c.title}</span>
                    {c.targetSlot && <Badge variant="outline" className="font-mono text-[9px]">{c.targetSlot}</Badge>}
                    <Badge
                      variant="outline"
                      className={c.status === "MERGED" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"}
                    >
                      {c.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ContributionRow({
  c,
  onMerge,
  onReject,
  mergePending,
  rejectPending,
}: {
  c: ContributionRecord;
  onMerge: () => void;
  onReject: () => void;
  mergePending: boolean;
  rejectPending: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-background/40 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
          <GitPullRequest className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{c.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            by <span className="font-mono">{c.contributorName}</span>
            {c.targetSlot && <> → <span className="font-mono text-primary/80">{c.targetSlot}</span></>}
          </p>
          <p className="line-clamp-1 text-[11px] text-muted-foreground/70">{c.description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="gap-1.5" disabled={mergePending} onClick={onMerge}>
          <GitMerge className="h-3 w-3" />
          Merge
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={rejectPending} onClick={onReject}>
          <X className="h-3 w-3" />
          Reject
        </Button>
      </div>
    </div>
  );
}
