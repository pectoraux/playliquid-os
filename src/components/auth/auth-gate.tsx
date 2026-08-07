"use client";

import { useState } from "react";
import { useSessionUser, useSignIn, useSignUp, useDemoAccounts } from "@/hooks/use-auth";
import { usePlayliquid } from "@/lib/playliquid/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Droplets,
  Mail,
  Lock,
  Loader2,
  ArrowRight,
  UserPlus,
  Zap,
  ShieldCheck,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useSessionUser();
  const user = data?.user;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function LoginScreen() {
  const [mode, setMode] = useState<Mode>("login");
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* background grid + glow */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-40" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/15 blur-[100px]" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Droplets className="h-6 w-6" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Playliquid OS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The frozen kernel for virtual worlds.
          </p>
        </div>

        <Card className="border-border bg-card/70 backdrop-blur">
          <CardContent className="p-6">
            {mode === "login" ? (
              <LoginForm onSwitch={() => setMode("signup")} />
            ) : (
              <SignUpForm onSwitch={() => setMode("login")} />
            )}
          </CardContent>
        </Card>

        <DemoLogins />

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          By continuing you agree that Playliquid OS is a frozen-architecture preview.
          <br />
          Sign-up adds you to the waitlist; the admin approves accounts.
        </p>
      </div>
    </div>
  );
}

function LoginForm({ onSwitch }: { onSwitch: () => void }) {
  const signIn = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    signIn.mutate(
      { email: email.trim().toLowerCase(), password },
      {
        onSuccess: () => toast.success("Signed in"),
        onError: (err) => toast.error(err.message),
      }
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="pl-9 bg-background/60"
            required
            autoFocus
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="pl-9 bg-background/60"
            required
          />
        </div>
      </div>
      <Button type="submit" className="w-full gap-2" disabled={signIn.isPending}>
        {signIn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Sign in
      </Button>
      <div className="text-center text-xs text-muted-foreground">
        No account?{" "}
        <button type="button" onClick={onSwitch} className="font-medium text-primary hover:underline">
          Join the waitlist
        </button>
      </div>
    </form>
  );
}

function SignUpForm({ onSwitch }: { onSwitch: () => void }) {
  const signUp = useSignUp();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    signUp.mutate(
      { email: email.trim().toLowerCase(), name: name.trim() || undefined },
      {
        onSuccess: () => {
          setDone(true);
          toast.success("You're on the waitlist!");
        },
        onError: (err) => toast.error(err.message),
      }
    );
  }

  if (done) {
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold">You're on the waitlist</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll email <span className="font-mono text-foreground/80">{email}</span> when your account is ready.
        </p>
        <Button variant="outline" className="mt-4" onClick={onSwitch}>
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[0.04] p-2.5">
        <Clock className="h-4 w-4 shrink-0 text-primary" />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Sign-up adds you to the <span className="text-foreground">waitlist</span>. The admin approves accounts before login is enabled.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Name (optional)</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="bg-background/60"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="pl-9 bg-background/60"
            required
            autoFocus
          />
        </div>
      </div>
      <Button type="submit" className="w-full gap-2" disabled={signUp.isPending}>
        {signUp.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
        Join the waitlist
      </Button>
      <div className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <button type="button" onClick={onSwitch} className="font-medium text-primary hover:underline">
          Sign in
        </button>
      </div>
    </form>
  );
}

function DemoLogins() {
  const { data } = useDemoAccounts();
  const signIn = useSignIn();
  const demos = data?.demos ?? [];

  if (demos.length === 0) return null;

  return (
    <div className="mt-4">
      <Separator className="mb-4 bg-border/60" />
      <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3 w-3 text-amber-400" />
        Quick demo login
      </div>
      <div className="flex flex-col gap-2">
        {demos.map((d) => (
          <button
            key={d.email}
            disabled={signIn.isPending}
            onClick={() =>
              signIn.mutate(
                { email: d.email, password: d.password },
                {
                  onSuccess: () => toast.success(`Signed in as ${d.name}`),
                  onError: (err) => toast.error(err.message),
                }
              )
            }
            className={cn(
              "group flex items-center gap-3 rounded-lg border border-border bg-card/40 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-card/70 disabled:opacity-60"
            )}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/40">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{d.name}</span>
                <Badge variant="outline" className="font-mono text-[9px] uppercase">
                  {d.role}
                </Badge>
              </div>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{d.email}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}
