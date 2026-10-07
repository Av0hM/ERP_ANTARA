"use client";
import { useShell } from "@/components/layout/app-shell";
import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { SubsystemHealthClient } from "../subsystems/[slug]/SubsystemHealthClient";
export default function DashboardPage() {
  const { data, current } = useShell();
  if (current.view === "SUBSYSTEM" && current.slug)
    return (
      <main>
        <p className="mb-4 text-sm text-muted">
          Readable subsystem context · administrative analytics are not
          available in this context.
        </p>
        <SubsystemHealthClient slug={current.slug} />
      </main>
    );
  if (current.view === "EMPTY")
    return (
      <main>
        <h1 className="text-2xl">{current.label}</h1>
        <p className="mt-4">
          No administrative subsystem access. Ask an OWNER to review your
          memberships.
        </p>
      </main>
    );
  return (
    <main className="space-y-6">
      <section className="section-dark rounded-2xl p-6">
        <p className="text-sm text-muted">Welcome, {data.user.name}</p>
        <h1 className="mt-2 text-3xl font-semibold">{current.label}</h1>
        <p className="mt-2 text-muted">
          {current.canManage
            ? "Authorized operational overview"
            : "Your assigned work and personal progress"}
        </p>
      </section>
      <DashboardLive />
    </main>
  );
}
