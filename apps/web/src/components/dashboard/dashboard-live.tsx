"use client";

import { AppRole } from "@antara/contracts";
import { ClipboardList, Layers3, ShieldAlert, Users2 } from "lucide-react";

import { InsightList } from "@/components/dashboard/insight-list";
import { MetricCard } from "@/components/dashboard/metric-card";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { VelocityChart } from "@/components/analytics/velocity-chart";
import { useDashboardData } from "@/hooks/use-operations";

const rolePanels: Record<
  AppRole,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    chips: Array<{ label: string; value: string; icon: typeof Layers3 }>;
    focusTitle: string;
    focusItems: Array<{ title: string; body: string; icon: typeof ClipboardList }>;
  }
> = {
  OWNER: {
    eyebrow: "Executive Overview",
    title: "Club-wide mission control",
    subtitle: "Track subsystem health, club velocity, and risk posture from a single command surface.",
    chips: [
      { label: "Governance", value: "Owner", icon: ShieldAlert },
      { label: "Alignment", value: "Program-level", icon: Layers3 },
      { label: "Stakeholders", value: "All subsystems", icon: Users2 },
    ],
    focusTitle: "Executive priorities",
    focusItems: [
      { title: "Club health and burn-down", body: "Monitor productivity, overdue rate, and AI risk signals across every subsystem.", icon: ClipboardList },
      { title: "Escalation readiness", body: "See blockers, approvals, and dependency risks before they become schedule slips.", icon: ClipboardList },
      { title: "Readout prep", body: "Use the live feed and insights panel to prepare for mentor or executive updates.", icon: ClipboardList },
    ],
  },
  ADMIN: {
    eyebrow: "Subsystem Command Center",
    title: "Engineering execution for subsystem leads",
    subtitle: "Balance task load, review approvals, and keep the subsystem board moving with less friction.",
    chips: [
      { label: "Triage", value: "Workload balance", icon: ShieldAlert },
      { label: "Execution", value: "Active board", icon: Layers3 },
      { label: "Cadence", value: "Reviews + handoffs", icon: Users2 },
    ],
    focusTitle: "Subsystem operations",
    focusItems: [
      { title: "Approvals and review queue", body: "Track what needs decisions, checks, or merge review next.", icon: ClipboardList },
      { title: "Workload distribution", body: "See where the team is stretched and rebalance before tasks pile up.", icon: ClipboardList },
      { title: "Cross-team dependencies", body: "Keep the subsystem aligned with the rest of the mission timeline.", icon: ClipboardList },
    ],
  },
  MEMBER: {
    eyebrow: "Personal Mission Feed",
    title: "Your engineering workspace",
    subtitle: "Focus on the tasks, reminders, and worklogs that matter most to your current subsystem assignments.",
    chips: [
      { label: "Focus", value: "Assigned work", icon: ShieldAlert },
      { label: "Momentum", value: "Progress feed", icon: Layers3 },
      { label: "Support", value: "Mentor-aware", icon: Users2 },
    ],
    focusTitle: "Today's priorities",
    focusItems: [
      { title: "Assigned tasks", body: "Review the next item in your queue and update progress as you go.", icon: ClipboardList },
      { title: "Deadlines and reminders", body: "Stay ahead of blockers and deadlines surfaced by the AI layer.", icon: ClipboardList },
      { title: "Worklog rhythm", body: "Capture sessions and notes so your contribution stays visible.", icon: ClipboardList },
    ],
  },
};

function FocusRail({
  role,
  items,
}: {
  role: AppRole;
  items: Array<{ title: string; body: string; icon: typeof ClipboardList }>;
}) {
  const config = rolePanels[role];
  return (
    <div className="card-dark rounded-[1.25rem] p-6">
      <p className="text-xs uppercase tracking-[0.28em] text-saffron">{config.focusTitle}</p>
      <h2 className="mt-2 text-xl font-semibold">{config.title}</h2>
      <p className="mt-2 text-sm text-muted">{config.subtitle}</p>
      <div className="mt-5 space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.title} className="rounded-xl border border-steel/30 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-2xl bg-saffron/10 text-saffron">
                  <Icon className="size-4" />
                </span>
                <h3 className="font-medium">{item.title}</h3>
              </div>
              <p className="mt-3 text-sm text-muted">{item.body}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardLive({ role }: { role: AppRole }) {
  const { data, isLoading } = useDashboardData();
  const config = rolePanels[role];

  return (
    <>
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6 md:p-8">
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-saffron">{config.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold">{config.title}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{config.subtitle}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {config.chips.map((chip) => {
              const Icon = chip.icon;
              return (
                <div key={chip.label} className="card-dark rounded-[1.25rem] p-4">
                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-muted">
                    <Icon className="size-4 text-saffron" />
                    {chip.label}
                  </div>
                  <p className="mt-2 text-lg font-medium">{chip.value}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="card-dark rounded-[1.25rem] p-6 animate-pulse">
                <div className="h-4 w-24 rounded-xl bg-white/10" />
                <div className="mt-3 h-10 w-16 rounded-xl bg-white/10" />
              </div>
            ))
          : (data?.metrics ?? []).length
          ? (data?.metrics ?? []).map((metric) => <MetricCard key={metric.label} metric={metric} />)
          : (
              <div className="col-span-full card-dark rounded-[1.25rem] p-6 text-center text-sm text-muted">
                No data yet - metrics will appear once tasks and worklogs are created.
              </div>
            )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <FocusRail role={role} items={config.focusItems} />
        <VelocityChart data={data?.velocity ?? []} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <InsightList insights={data?.insights ?? []} />
        <NotificationCenter />
      </section>
    </>
  );
}