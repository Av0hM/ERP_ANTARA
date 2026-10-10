"use client";

import { useEffect, useState, type FormEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const baseUrl =
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.API_URL ??
  "http://localhost:4000/api";

type ValidationState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "unavailable" }
  | {
      status: "valid";
      email: string;
      globalRole: string;
      expiresAt: string;
      memberships: { subsystemId: string; name: string; accessLevel: string }[];
    };

export function InviteAcceptForm({
  token,
  googleAuthEnabled = false,
}: {
  token: string;
  googleAuthEnabled?: boolean;
}) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [validation, setValidation] = useState<ValidationState>({
    status: "loading",
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`${baseUrl}/invitations/validate/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("Unavailable");
        return res.json();
      })
      .then(
        (data: {
          valid: boolean;
          email?: string;
          globalRole?: string;
          expiresAt?: string;
          memberships?: {
            subsystemId: string;
            name: string;
            accessLevel: string;
          }[];
        }) => {
          if (cancelled) return;
          if (
            data.valid &&
            data.email &&
            data.globalRole &&
            data.expiresAt &&
            data.memberships
          ) {
            setValidation({
              status: "valid",
              email: data.email,
              globalRole: data.globalRole,
              expiresAt: data.expiresAt,
              memberships: data.memberships,
            });
          } else {
            setValidation({ status: "invalid" });
          }
        },
      )
      .catch(() => {
        if (!cancelled) setValidation({ status: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const acceptAsAccount =
    validation.status === "valid" &&
    !session?.error &&
    !!session?.accessToken &&
    session.user.email?.toLowerCase() === validation.email.toLowerCase();

  const wrongAccount =
    !!session?.accessToken &&
    !session.error &&
    validation.status === "valid" &&
    !acceptAsAccount;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (wrongAccount || sessionStatus === "loading") return;
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(
        `${baseUrl}/invitations/${acceptAsAccount ? "accept-existing" : "accept"}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(acceptAsAccount
              ? { Authorization: `Bearer ${session?.accessToken}` }
              : {}),
          },
          body: JSON.stringify(
            acceptAsAccount ? { token } : { token, password, name },
          ),
        },
      );

      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({ message: "Something went wrong. Try again." }));
        setError(body.message ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }

      if (acceptAsAccount) await signOut({ redirect: false });
      setAccepted(true);
      window.setTimeout(() => router.push("/login"), 1500);
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  };

  if (validation.status === "loading" || sessionStatus === "loading") {
    return (
      <section className="glass-modal w-full max-w-lg rounded-[2rem] p-8">
        <p className="text-sm text-muted">Checking your invitation…</p>
      </section>
    );
  }

  if (validation.status === "invalid" || validation.status === "unavailable") {
    return (
      <section className="glass-modal w-full max-w-lg rounded-[2rem] p-8">
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            {validation.status === "unavailable"
              ? "Invitation service unavailable. Reload to try again."
              : "This invitation is invalid, expired or no longer available. Ask your team admin for a new one."}
          </p>
        </div>
      </section>
    );
  }

  if (accepted) {
    return (
      <section className="glass-modal w-full max-w-lg rounded-[2rem] p-8">
        <div className="flex items-start gap-3 rounded-xl border border-saffron/30 bg-saffron/10 px-4 py-3 text-sm text-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-saffron" />
          <p>Access updated. Sign in again to continue…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-modal w-full max-w-lg rounded-[2rem] p-8">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-saffron/10 text-saffron">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.32em] text-saffron">
            You&apos;re invited
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-text">
            Join AntaraERP
          </h1>
        </div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        Accept the invitation for{" "}
        <span className="text-text">{validation.email}</span> as{" "}
        <span className="text-text">{validation.globalRole}</span>.
      </p>

      <ul className="mt-3 space-y-1 text-sm text-text">
        {validation.memberships.map((grant) => (
          <li key={grant.subsystemId}>
            {grant.name} — {grant.accessLevel}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted">
        Expires {new Date(validation.expiresAt).toLocaleString()}
      </p>
      {wrongAccount && (
        <div role="alert" className="mt-4 space-y-3">
          <p>
            This invitation belongs to a different account. Sign out before
            continuing.
          </p>
          <Button onClick={() => signOut({ callbackUrl: `/invite/${token}` })}>
            Sign out
          </Button>
        </div>
      )}
      {!wrongAccount && !acceptAsAccount && googleAuthEnabled && (
        <Button
          className="mt-4 w-full"
          variant="secondary"
          onClick={() => signIn("google", { callbackUrl: `/invite/${token}` })}
        >
          Continue with Google
        </Button>
      )}
      {!wrongAccount && !acceptAsAccount && (
        <p className="mt-2 text-sm text-muted">
          New users: choose a password. Existing users: enter your current
          password, or{" "}
          <a
            className="underline"
            href={`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`}
          >
            sign in first
          </a>{" "}
          to accept with your account, including Google.
        </p>
      )}
      {!wrongAccount && (
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          {!acceptAsAccount && (
            <>
              <label className="block">
                <span className="mb-2 block text-sm text-muted">Full name</span>
                <input
                  className="input-field"
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
                  className="input-field"
                  type="password"
                  placeholder="Choose a password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={8}
                  maxLength={72}
                />
              </label>
            </>
          )}
          {error ? (
            <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          ) : null}

          <Button className="w-full gap-2" type="submit" disabled={submitting}>
            {submitting ? "Accepting invitation…" : "Accept invitation"}
          </Button>
        </form>
      )}
    </section>
  );
}
