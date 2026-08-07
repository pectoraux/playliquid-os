"use client";

import {
  useWaitlist,
  useApproveWaitlist,
  useRejectWaitlist,
} from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users, Check, X, Loader2, Mail, Clock } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "../primitives";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  note: string | null;
}

export function AdminPanel() {
  const { data: entries, isLoading } = useWaitlist(true);
  const approve = useApproveWaitlist();
  const reject = useRejectWaitlist();

  const pending = (entries ?? []).filter((e) => e.status === "PENDING");
  const reviewed = (entries ?? []).filter((e) => e.status !== "PENDING");

  function doApprove(e: WaitlistEntry) {
    approve.mutate(e.id, {
      onSuccess: (res) => toast.success(`Account created for ${e.email}. Default password: ${res.defaultPassword}`),
      onError: (err) => toast.error(err.message),
    });
  }
  function doReject(e: WaitlistEntry) {
    reject.mutate(e.id, {
      onSuccess: () => toast.success(`Rejected ${e.email}`),
      onError: (err) => toast.error(err.message),
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pending" value={pending.length} icon={<Clock className="h-4 w-4" />} accent="amber" />
        <StatCard label="Approved" value={reviewed.filter((e) => e.status === "APPROVED").length} icon={<Check className="h-4 w-4" />} accent="emerald" />
        <StatCard label="Rejected" value={reviewed.filter((e) => e.status === "REJECTED").length} icon={<X className="h-4 w-4" />} accent="rose" />
      </div>

      <Card className="border-border bg-card/40">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-primary" />
            Waitlist — Pending Approval
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : pending.length === 0 ? (
            <EmptyState>No pending requests. The waitlist is clear.</EmptyState>
          ) : (
            <ScrollArea className="max-h-[400px] pr-3 scroll-thin">
              <div className="space-y-2">
                {pending.map((e) => (
                  <div
                    key={e.id}
                    className="flex flex-col gap-3 rounded-md border border-border/60 bg-background/40 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{e.name ?? "Anonymous"}</p>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{e.email}</p>
                        <p className="text-[10px] text-muted-foreground/70">
                          requested {new Date(e.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        disabled={approve.isPending}
                        onClick={() => doApprove(e as WaitlistEntry)}
                      >
                        <Check className="h-3 w-3" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        disabled={reject.isPending}
                        onClick={() => doReject(e as WaitlistEntry)}
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {reviewed.length > 0 && (
        <Card className="border-border bg-card/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Reviewed ({reviewed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[260px] pr-3 scroll-thin">
              <div className="space-y-1.5">
                {reviewed.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-md border border-border/40 bg-background/30 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-foreground/80">{e.email}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        e.status === "APPROVED"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      }
                    >
                      {e.status}
                    </Badge>
                    {e.reviewedAt && (
                      <span className="text-[10px] text-muted-foreground/70">
                        {new Date(e.reviewedAt).toLocaleDateString()}
                      </span>
                    )}
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

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: "amber" | "emerald" | "rose";
}) {
  const cls = {
    amber: "text-amber-400 border-amber-500/20 bg-amber-500/[0.04]",
    emerald: "text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.04]",
    rose: "text-rose-400 border-rose-500/20 bg-rose-500/[0.04]",
  }[accent];
  return (
    <Card className={`border-border bg-card/40 ${cls}`}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-2xl font-semibold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-md border ${cls}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}
