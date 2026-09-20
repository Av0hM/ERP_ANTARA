"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000/api";

type ValidationState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "valid"; email: string; role: string };

export function InviteAcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [validation, setValidation] = useState<ValidationState>({ status: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`${baseUrl}/invitations/validate/${token}`)
      .then((res) => res.json())
      .then((data: { valid: boolean; email?: string; role?: string }) => {
        if (cancelled) return;
        if (data.valid && data.email && data.role) {
          setValidation({ status: "valid", email: data.email, role: data.role });
        } else {
          setValidation({ status: "invalid" });
        }
      })
      .catch(() => {
        if (!cancelled) setValidation({ status: "invalid" });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`${baseUrl}/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, name }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Something went wrong. Try again." }));
        setError(body.message ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }

      setAccepted(true);
      window.setTimeout(() => router.push("/login"), 1500);
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  };

  if (validation.status === "loading") {
    return (
      <section className="glass-panel w-full max-w-lg rounded-[2rem] border border-line/80 p-8 shadow-2xl shadow-black/20">
        <p className="text-sm text-muted">Checking your invitation…</p>
      </section>
    );
  }

  if (validation.status === "invalid") {
    return (
      <section className="glass-panel w-full max-w-lg rounded-[2rem] border border-line/80 p-8 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>This invitation link is invalid or has expired. Ask your team admin to send a new one.</p>
        </div>
      </section>
    );
  }

  if (accepted) {
    return (
      <section className="glass-panel w-full max-w-lg rounded-[2rem] border border-line/80 p-8 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>Account created. Redirecting you to sign in…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel w-full max-w-lg rounded-[2rem] border border-line/80 p-8 shadow-2xl shadow-black/20">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-accent">You&apos;re invited</p>
          <h1 className="mt-1 text-3xl font-semibold text-text">Join AntaraERP</h1>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        Set a password for <span className="text-text">{validation.email}</span> to join as{" "}
        <span className="text-text">{validation.role}</span>.
      </p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Full name</span>
          <input
            className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-text outline-none ring-0 transition placeholder:text-muted/60 focus:border-accent/60"
            placeholder="Your name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Password</span>
          <input
            className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-text outline-none ring-0 transition placeholder:text-muted/60 focus:border-accent/60"
            type="password"
            placeholder="Choose a password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />
        </label>

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{error}</p>
          </div>
        ) : null}

        <Button className="w-full gap-2" type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Accept invitation"}
        </Button>
      </form>
    </section>
  );
}