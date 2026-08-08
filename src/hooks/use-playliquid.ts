"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ArchitectureManifest,
  PackageRecord,
  WorldProjectRecord,
  WorldBuildRecord,
  WorldNodeRecord,
  EntityRecord,
  KernelEventRecord,
  ReusePolicy,
  Family,
} from "@/lib/playliquid/types";

const api = {
  get: async <T>(url: string): Promise<T> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json() as Promise<T>;
  },
  post: async <T>(url: string, body?: unknown): Promise<T> => {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.json() as Promise<T>;
  },
};

// ── Architecture ──────────────────────────────────────────────────
export function useArchitecture() {
  return useQuery({
    queryKey: ["architecture"],
    queryFn: () => api.get<ArchitectureManifest>("/api/architecture"),
    staleTime: Infinity,
  });
}

// ── Packages ──────────────────────────────────────────────────────
export function usePackages(family?: string, q?: string) {
  const params = new URLSearchParams();
  if (family && family !== "all") params.set("family", family);
  if (q) params.set("q", q);
  const qs = params.toString();
  return useQuery({
    queryKey: ["packages", family, q],
    queryFn: () => api.get<PackageRecord[]>(`/api/packages${qs ? `?${qs}` : ""}`),
    staleTime: 5000,
  });
}

export function usePackage(id: string | null) {
  return useQuery({
    queryKey: ["package", id],
    queryFn: () => api.get<PackageRecord>(`/api/packages/${id}`),
    enabled: !!id,
  });
}

export function useCreatePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      displayName?: string;
      description?: string;
      family: Family;
      version?: string;
      license?: string;
      capabilities?: string[];
      provides?: Array<{ name: string; family?: string; description?: string }>;
      requires?: Array<{ name: string; family?: string; description?: string }>;
      manifest?: Record<string, unknown>;
      specification?: Record<string, unknown>;
    }) => api.post<PackageRecord>("/api/packages", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["packages"] }),
  });
}

// ── World Projects ────────────────────────────────────────────────
export function useWorldProjects() {
  return useQuery({
    queryKey: ["world-projects"],
    queryFn: () => api.get<WorldProjectRecord[]>("/api/world-projects"),
    staleTime: 5000,
  });
}

export function useWorldProject(id: string | null) {
  return useQuery({
    queryKey: ["world-project", id],
    queryFn: () => api.get<WorldProjectRecord>(`/api/world-projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateWorldProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      slug?: string;
      description?: string;
      theme?: Record<string, unknown>;
      rules?: Record<string, unknown>;
    }) => api.post<WorldProjectRecord>("/api/world-projects", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["world-projects"] }),
  });
}

// ── Compose ───────────────────────────────────────────────────────
export function useCompose() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { worldProjectId: string; packageIds: string[] }) =>
      api.post<{ build: WorldBuildRecord; unsatisfied: string[] }>("/api/compose", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["world-builds"] });
      qc.invalidateQueries({ queryKey: ["world-projects"] });
      qc.invalidateQueries({ queryKey: ["world-project"] });
    },
  });
}

// ── World Builds ──────────────────────────────────────────────────
export function useWorldBuilds(projectId?: string) {
  const qs = projectId ? `?projectId=${projectId}` : "";
  return useQuery({
    queryKey: ["world-builds", projectId],
    queryFn: () => api.get<WorldBuildRecord[]>(`/api/world-builds${qs}`),
    staleTime: 5000,
  });
}

export function useWorldBuild(id: string | null) {
  return useQuery({
    queryKey: ["world-build", id],
    queryFn: () => api.get<WorldBuildRecord>(`/api/world-builds/${id}`),
    enabled: !!id,
    refetchInterval: 4000,
  });
}

// ── World Nodes ───────────────────────────────────────────────────
export function useWorldNodes(buildId?: string) {
  const qs = buildId ? `?buildId=${buildId}` : "";
  return useQuery({
    queryKey: ["world-nodes", buildId],
    queryFn: () => api.get<WorldNodeRecord[]>(`/api/world-nodes${qs}`),
    refetchInterval: 4000,
  });
}

export function useStartNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<WorldNodeRecord>(`/api/world-nodes/${id}/start`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["world-nodes"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["kernel-events"] });
    },
  });
}

export function useStopNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<WorldNodeRecord>(`/api/world-nodes/${id}/stop`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["world-nodes"] }),
  });
}

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { worldBuildId: string; host: string }) =>
      api.post<WorldNodeRecord>("/api/world-nodes", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["world-nodes"] }),
  });
}

// ── Entities ──────────────────────────────────────────────────────
export function useEntities(buildId?: string) {
  const qs = buildId ? `?buildId=${buildId}` : "";
  return useQuery({
    queryKey: ["entities", buildId],
    queryFn: () => api.get<EntityRecord[]>(`/api/entities${qs}`),
    refetchInterval: 3000,
  });
}

// ── Kernel ────────────────────────────────────────────────────────
export function useKernelEvents(limit = 50) {
  return useQuery({
    queryKey: ["kernel-events", limit],
    queryFn: () => api.get<KernelEventRecord[]>(`/api/kernel/events?limit=${limit}`),
    refetchInterval: 2000,
  });
}

export function useTick() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ events: KernelEventRecord[]; count: number }>("/api/kernel/tick"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kernel-events"] });
      qc.invalidateQueries({ queryKey: ["entities"] });
      qc.invalidateQueries({ queryKey: ["world-nodes"] });
    },
  });
}

// ── Generation pipeline ───────────────────────────────────────────
export function useGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { naturalLanguage: string; worldProjectId?: string; family: string }) =>
      api.post<{
        requestId: string;
        specification: Record<string, unknown>;
        prompt: string;
        package: PackageRecord | null;
      }>("/api/generate", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packages"] });
      qc.invalidateQueries({ queryKey: ["kernel-events"] });
    },
  });
}

// ── World Services ────────────────────────────────────────────────
export function useWorldServices() {
  return useQuery({
    queryKey: ["world-services"],
    queryFn: () => api.get<import("@/lib/playliquid/types").WorldServiceRecord[]>("/api/world-services"),
    staleTime: 30000,
  });
}

// ── Kernel services ───────────────────────────────────────────────
export function useKernelServices() {
  return useQuery({
    queryKey: ["kernel-services"],
    queryFn: () => api.get<import("@/lib/playliquid/types").WorldServiceRecord[]>("/api/kernel/services"),
    staleTime: 30000,
  });
}

// ── Capability negotiation ────────────────────────────────────────
export function useNegotiateCapabilities() {
  return useMutation({
    mutationFn: (body: { packageId: string; worldProjectId: string; zoneName?: string; experienceName?: string }) =>
      api.post<{
        package: import("@/lib/playliquid/types").PackageRecord;
        declared: string[];
        effective: import("@/lib/playliquid/types").EffectiveCapability[];
      }>("/api/capabilities/negotiate", body),
  });
}

// ── Reuse-first ───────────────────────────────────────────────────
export function useReuseFirst() {
  return useMutation({
    mutationFn: (body: {
      naturalLanguage: string;
      canonical: Record<string, unknown>;
      worldProjectId?: string;
      policy?: import("@/lib/playliquid/types").ReusePolicy;
      neverReuseFamilies?: string[];
    }) =>
      api.post<import("@/lib/playliquid/types").ReuseFirstResult>("/api/reuse", body),
  });
}

// ── Contributions ─────────────────────────────────────────────────
export function useContributions(projectId?: string, status?: string) {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (status) params.set("status", status);
  const qs = params.toString();
  return useQuery({
    queryKey: ["contributions", projectId, status],
    queryFn: () => api.get<import("@/lib/playliquid/types").ContributionRecord[]>(`/api/contributions${qs ? `?${qs}` : ""}`),
    refetchInterval: 8000,
  });
}

export function useMergeContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<import("@/lib/playliquid/types").ContributionRecord>(`/api/contributions/${id}/merge`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contributions"] }),
  });
}

export function useRejectContribution() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; note?: string }) =>
      api.post<import("@/lib/playliquid/types").ContributionRecord>(`/api/contributions/${body.id}/reject`, { note: body.note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contributions"] }),
  });
}

// ── Spatial slots ─────────────────────────────────────────────────
export function useSpatialSlots(projectId?: string) {
  const qs = projectId ? `?projectId=${projectId}` : "";
  return useQuery({
    queryKey: ["spatial-slots", projectId],
    queryFn: () => api.get<import("@/lib/playliquid/types").SpatialSlotRecord[]>(`/api/spatial-slots${qs}`),
  });
}
