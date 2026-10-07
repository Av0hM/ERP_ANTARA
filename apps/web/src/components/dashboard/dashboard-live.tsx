"use client";
import { InsightList } from "./insight-list";
import { MetricCard } from "./metric-card";
import { VelocityChart } from "@/components/analytics/velocity-chart";
import { useDashboardData, useTaskCatalog } from "@/hooks/use-operations";
import { useShell } from "@/components/layout/app-shell";
export function DashboardLive() {
  const { data: shell, current } = useShell();
  const { data, isLoading, error, refetch } = useDashboardData();
  const tasks = useTaskCatalog();
  if (error)
    return (
      <div role="alert" className="card-dark rounded-xl p-6">
        <p>{error.message}</p>
        <button className="mt-3 underline" onClick={() => void refetch()}>
          Retry dashboard
        </button>
      </div>
    );
  const personalTasks =
    tasks.data?.filter((task) => task.assignedToId === shell.user.id) ?? [];
  return (
    <>
      <section
        aria-label="Dashboard metrics"
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {isLoading ? (
          <p role="status">Loading dashboard…</p>
        ) : data?.metrics.length ? (
          data.metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))
        ) : (
          <p className="col-span-full rounded-xl border border-steel/30 p-6">
            No data yet. Your authorized metrics will appear as work is
            recorded.
          </p>
        )}
      </section>
      {!current.canManage && (
        <section className="card-dark rounded-xl p-6">
          <h2 className="text-xl">Your assigned tasks</h2>
          {tasks.isLoading ? (
            <p>Loading tasks…</p>
          ) : tasks.isError ? (
            <p role="alert">Unable to load your tasks.</p>
          ) : !personalTasks.length ? (
            <p className="mt-3 text-muted">No personal tasks assigned.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {personalTasks.map((task) => (
                <li key={task.id}>
                  {task.title} · {task.status}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <section className="grid gap-6 xl:grid-cols-2">
        {data?.velocity.length ? (
          <VelocityChart data={data.velocity} />
        ) : (
          <p className="card-dark rounded-xl p-6">
            No authorized trend history yet.
          </p>
        )}
        {data?.insights.length ? (
          <InsightList insights={data.insights} />
        ) : (
          <p className="card-dark rounded-xl p-6">
            No insights available for this context.
          </p>
        )}
      </section>
    </>
  );
}
