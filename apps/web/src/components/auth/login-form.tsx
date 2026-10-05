"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";


export function LoginForm({
  callbackUrl = "/dashboard",
  googleAuthEnabled = false,
}: {
  callbackUrl?: string;
  googleAuthEnabled?: boolean;
}) {
  const router = useRouter();
  const { status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setError(null);
    setSubmitting(true);
    try {
      const result = await signIn("credentials", { email: String(values.get("email") ?? ""), password: String(values.get("password") ?? ""), redirect: false, redirectTo: callbackUrl });
      if (!result || result.error) {
        setError("Invalid email or password. Use your team login.");
        return;
      }
      router.replace(callbackUrl);
      router.refresh();
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = () => {
    setError(null);
    void signIn("google", { callbackUrl }, { prompt: "select_account" });
  };

  return (
    <section className="glass-modal w-full max-w-lg rounded-[2rem] p-8">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-saffron/10 text-saffron">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-saffron">Secure Access</p>
          <h1 className="mt-1 text-3xl font-semibold text-text">Sign in to AntaraERP</h1>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        Enter the mission workspace with role-aware access, token refresh, and protected operations across tasks, analytics, and AI.
      </p>

      <form
        className="mt-8 space-y-4"
        method="POST"
        action="/api/auth/callback/credentials"
        onSubmit={handleCredentialsSubmit}
      >
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Email</span>
          <input
            name="email"
            disabled={!ready || submitting}
            className="input-field"
            placeholder="owner@antara.club"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Password</span>
          <input
            name="password"
            disabled={!ready || submitting}
            className="input-field"
            type="password"
            placeholder="Enter password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-saffron transition hover:text-text" onClick={() => setShowForgotPassword((current) => !current)}>
            Forgot password?
          </button>
        </div>

        {showForgotPassword ? (
          <div className="rounded-xl border border-steel/30 bg-white/5 px-4 py-3 text-sm text-muted flex items-start justify-between gap-3">
            <p>Password resets are managed by your team administrator. Contact your admin to reset your credentials.</p>
            <button type="button" className="text-muted transition hover:text-text" onClick={() => setShowForgotPassword(false)}>
              x
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <Button className="w-full gap-2" type="submit" disabled={!ready || submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={!googleAuthEnabled}
          title={!googleAuthEnabled ? "Google OAuth not configured" : undefined}
        >
          Continue with Google Workspace
        </Button>
      </form>
    </section>
  );
}