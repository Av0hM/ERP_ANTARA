"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clearExpiredLoginCooldown,
  loginCooldownUntil,
} from "@/lib/login-cooldown";

export function LoginCooldown() {
  const router = useRouter();
  const [remaining, setRemaining] = useState(90);
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    const blockedUntil = loginCooldownUntil(Date.now());
    const update = () =>
      setRemaining(Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000)));
    update();
    setInitialized(true);
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const ready = remaining === 0;
  const countdown = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  return (
    <section
      className="glass-modal w-full max-w-lg rounded-[2rem] p-8"
      aria-labelledby="cooldown-title"
      aria-busy={!initialized}
    >
      <ShieldAlert className="mb-4 size-8 text-saffron" aria-hidden="true" />
      <h1 id="cooldown-title" className="text-3xl font-semibold text-text">
        Too many login attempts
      </h1>
      <p className="mt-4 text-sm leading-6 text-muted">
        For security, sign-in has been temporarily limited. Please wait 90
        seconds before trying again.
      </p>
      <p
        className="my-6 font-mono text-lg tabular-nums text-text"
        role="timer"
        aria-live="off"
      >
        Retry available in {countdown}
      </p>
      <p role="status" className="mb-4 text-sm text-muted">
        {ready ? "You can try signing in again." : ""}
      </p>
      <Button
        className="w-full disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        disabled={!initialized || !ready}
        onClick={() => {
          if (!initialized || !ready) return;
          clearExpiredLoginCooldown();
          router.replace("/login");
        }}
      >
        {ready ? "Back to login" : "Try again"}
      </Button>
    </section>
  );
}
