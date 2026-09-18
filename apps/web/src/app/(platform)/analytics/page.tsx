import { AnalyticsLive } from "@/components/analytics/analytics-live";
import { AiSummaryPanel } from "@/components/analytics/ai-summary-panel";

export default function AnalyticsPage() {
  return (
    <main className="space-y-6">
      <section className="glass-panel rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-accent">Analytics Engine</p>
        <h1 className="mt-3 text-4xl font-semibold">Club health and subsystem throughput</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Recharts-based operational intelligence with mission trends, delivery risk, workload scoring, and AI-backed performance interpretation.
        </p>
      </section>
      <AiSummaryPanel />
      <AnalyticsLive />
    </main>
  );
}
