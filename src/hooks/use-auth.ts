"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { signIn, signOut } from "next-auth/react";

interface SessionUser {
  id?: string;
  email?: string | null;
  name?: string | null;
  role?: string;
  status?: string;
}

// ── Session ───────────────────────────────────────────────────────
export function useSessionUser() {
  return useQuery({
    queryKey: ["auth-session"],
    queryFn: async (): Promise<{ user: SessionUser | null }> => {
      const r = await fetch("/api/auth/session", { cache: "no-store" });
      if (!r.ok) return { user: null };
      return r.json();
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

// ── Sign in / out ─────────────────────────────────────────────────
export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await signIn("credentials", { email, password, redirect: false });
      if (!res || res.error) throw new Error("Invalid email or password");
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auth-session"] }),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await signOut({ redirect: false });
      // Force-fetch the session endpoint to confirm it's cleared
      await fetch("/api/auth/session", { cache: "no-store" });
    },
    onSuccess: () => {
      qc.setQueryData(["auth-session"], { user: null });
      qc.invalidateQueries({ queryKey: ["auth-session"] });
    },
  });
}

// ── Sign up (waitlist) ────────────────────────────────────────────
export function useSignUp() {
  return useMutation({
    mutationFn: async ({ email, name }: { email: string; name?: string }) => {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Sign-up failed");
      return data;
    },
  });
}

// ── Demo accounts (for quick-login) ───────────────────────────────
export function useDemoAccounts() {
  return useQuery({
    queryKey: ["demo-accounts"],
    queryFn: async () => {
      const r = await fetch("/api/auth/demo");
      if (!r.ok) return { demos: [] };
      return r.json() as Promise<{ demos: Array<{ email: string; name: string; role: string; password: string }> }>;
    },
    staleTime: Infinity,
  });
}

// ── Admin: waitlist ───────────────────────────────────────────────
export function useWaitlist(enabled: boolean) {
  return useQuery({
    queryKey: ["waitlist"],
    queryFn: async () => {
      const r = await fetch("/api/waitlist?adminToken=playliquid-internal");
      if (!r.ok) throw new Error("Failed to load waitlist");
      return r.json() as Promise<
        Array<{ id: string; email: string; name: string | null; status: string; createdAt: string; reviewedAt: string | null }>
      >;
    },
    enabled,
    refetchInterval: 10_000,
  });
}

export function useApproveWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/waitlist/${id}/approve`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Approval failed");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waitlist"] }),
  });
}

export function useRejectWaitlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/waitlist/${id}/reject`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Rejection failed");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["waitlist"] }),
  });
}
