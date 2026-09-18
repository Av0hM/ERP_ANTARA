"use client";

import { AppRole } from "@antara/contracts";

import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { useActorProfile } from "@/hooks/use-actor-profile";

const roleGreeting: Record<AppRole, string> = {
  OWNER: "Mission control view across the entire club",
  ADMIN: "Subsystem command center for engineering execution",
  MEMBER: "Your personal engineering operations feed",
};

export default function DashboardPage() {
  const actor = useActorProfile();

  if (!actor) {
    return null;
  }

  const { role, name } = actor;

  return (
    <main className="space-y-6">
      <section className="glass-panel rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-accent">{role}</p>
        <h1 className="mt-3 text-4xl font-semibold">Mission control dashboard</h1>
        <p className="mt-3 max-w-2xl text-muted">
          {name}, {roleGreeting[role]}. This dashboard reshapes itself around your responsibilities instead of showing everyone the same view.
        </p>
      </section>
      <DashboardLive role={role} />
    </main>
  );
}

