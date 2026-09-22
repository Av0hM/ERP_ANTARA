"use client";

import { HeatmapGrid } from "@/components/analytics/heatmap-grid";
import { InsightList } from "@/components/dashboard/insight-list";
import { VelocityChart } from "@/components/analytics/velocity-chart";
import { useAnalyticsData } from "@/hooks/use-operations";

export function AnalyticsLive() {
  const { overview, velocity, heatmap, subsystems, insights, reminders, schedule, workload } = useAnalyticsData();

  return (
    <div className="space-y-6">
      {overview ? (
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { label: "Productivity Index", value: `${overview.productivityIndex}` },
            { label: "Subsystem Velocity", value: `${overview.subsystemVelocity}%` },
            { label: "Overdue Rate", value: `${overview.overdueRate}%` },
            { label: "Club Health", value: `${overview.clubHealth}` },
          ].map((metric) => (
            <div key={metric.label} className="card-dark rounded-[1.25rem] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-muted">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold">{metric.value}</p>
            </div>
          ))}
        </section>
      ) : null}

      <VelocityChart data={velocity} />

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <HeatmapGrid data={heatmap} />
        <div className="card-dark rounded-[1.25rem] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-saffron">Subsystem Breakdown</p>
          <div className="mt-4 space-y-3">
            {subsystems.map((item) => (
              <div key={item.name} className="rounded-xl border border-steel/30 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{item.name}</h3>
                  <span className="text-xs text-saffron">{item.velocity}% velocity</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-muted">
                  <span>Risk: {item.risk}</span>
                  <span>Completed: {item.completion}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <InsightList insights={insights} />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card-dark rounded-[1.25rem] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-saffron">Smart Reminders</p>
          <div className="mt-4 space-y-3">
            {reminders.map((item) => (
              <div key={item.id} className="rounded-xl border border-steel/30 bg-white/5 p-3 text-sm text-muted">
                {item.message}
              </div>
            ))}
          </div>
        </div>
        <div className="card-dark rounded-[1.25rem] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-saffron">Scheduling AI</p>
          <div className="mt-4 space-y-3">
            {schedule.map((item) => (
              <div key={item.id} className="rounded-xl border border-steel/30 bg-white/5 p-3">
                <p className="font-medium">{item.title}</p>
                <p className="mt-2 text-sm text-muted">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card-dark rounded-[1.25rem] p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-saffron">Workload Balancing</p>
          <div className="mt-4 space-y-3">
            {workload.map((item) => (
              <div key={item.id} className="rounded-xl border border-steel/30 bg-white/5 p-3">
                <p className="font-medium">
                  {item.from} to {item.to}
                </p>
                <p className="mt-2 text-sm text-muted">{item.reason}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}