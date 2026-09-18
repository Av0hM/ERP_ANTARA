import { InsightCard, InsightSeverity } from "@antara/contracts";

const severityClass: Record<InsightSeverity, string> = {
  INFO: "text-cobalt border-cobalt/30 bg-cobalt/10",
  WARNING: "text-amber border-amber/30 bg-amber/10",
  CRITICAL: "text-danger border-danger/30 bg-danger/10",
};

export function InsightList({ insights }: { insights: InsightCard[] }) {
  return (
    <div className="glass-panel rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-accent">AI Mission Insights</p>
          <h2 className="mt-2 text-xl font-semibold">Operational risk and recommendations</h2>
        </div>
      </div>

      <div className="space-y-4">
        {insights.map((insight) => (
          <div key={insight.id} className="rounded-2xl border border-line bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium">{insight.title}</h3>
              <span className={`rounded-full border px-3 py-1 text-xs ${severityClass[insight.severity]}`}>
                {insight.severity}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{insight.summary}</p>
            {insight.subsystem ? (
              <p className="mt-3 text-xs uppercase tracking-[0.2em] text-cobalt">{insight.subsystem}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}


