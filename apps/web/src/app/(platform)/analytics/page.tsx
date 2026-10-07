"use client";
import { useShell } from "@/components/layout/app-shell";
import { AnalyticsLive } from "@/components/analytics/analytics-live";
import { AiSummaryPanel } from "@/components/analytics/ai-summary-panel";

export default function AnalyticsPage() {
  const { current } = useShell();
  if (current.view !== "ANALYTICS")
    return (
      <main>
        <h1 className="text-3xl">Analytics</h1>
        <p className="mt-4">
          Administrative analytics are unavailable in this context. Use your
          primary dashboard or a managed subsystem.
        </p>
      </main>
    );
  return (
    <main className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-saffron">
          Analytics Engine
        </p>
        <h1 className="mt-3 text-4xl font-semibold">
          {current.label} analytics
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Recharts-based operational intelligence with mission trends, delivery
          risk, workload scoring, and AI-backed performance interpretation.
        </p>
      </section>
      <AiSummaryPanel />
      <AnalyticsLive />
    </main>
  );
}
