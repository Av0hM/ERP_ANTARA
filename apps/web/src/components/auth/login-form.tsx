"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getCsrfToken, signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

const demoLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";

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
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [callbackUrl, router, status]);

  useEffect(() => {
    void getCsrfToken().then((token) => setCsrfToken(token ?? null));
  }, []);

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (demoLoginEnabled) {
      document.cookie = "orbitalops-dev-session=1; path=/; SameSite=Lax";
      window.location.assign(callbackUrl);
      return;
    }

    const form = event.currentTarget;
    const tokenInput = form.elements.namedItem("csrfToken") as HTMLInputElement | null;
    const token = csrfToken ?? (await getCsrfToken());

    if (!token || !tokenInput) {
      setError("Invalid email or password. Use your team login.");
      return;
    }

    tokenInput.value = token;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    form.submit();
  };

  const handleGoogleSignIn = () => {
    setError(null);
    void signIn("google", { callbackUrl }, { prompt: "select_account" });
  };

  return (
    <section className="glass-panel w-full max-w-lg rounded-[2rem] border border-line/80 p-8 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-accent">Secure Access</p>
          <h1 className="mt-1 text-3xl font-semibold text-text">Sign in to AntaraERP</h1>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        Enter the mission workspace with role-aware access, token refresh, and protected operations across tasks, analytics, and AI.
      </p>

      <form
        className="mt-8 space-y-4"
        method="POST"
        action={`/api/auth/callback/credentials?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        onSubmit={handleCredentialsSubmit}
      >
        <input type="hidden" name="csrfToken" value={csrfToken ?? ""} />
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Email</span>
          <input
            name="email"
            className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-text outline-none ring-0 transition placeholder:text-muted/60 focus:border-accent/60"
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
            className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-text outline-none ring-0 transition placeholder:text-muted/60 focus:border-accent/60"
            type="password"
            placeholder="Enter password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-accent transition hover:text-text" onClick={() => setShowForgotPassword((current) => !current)}>
            Forgot password?
          </button>
        </div>

        {showForgotPassword ? (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm text-muted">
            <p>Password resets are managed by your team administrator. Contact your admin to reset your credentials.</p>
            <button type="button" className="text-muted transition hover:text-text" onClick={() => setShowForgotPassword(false)}>
              x
            </button>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <Button className="w-full gap-2" type="submit">
          Sign In
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

