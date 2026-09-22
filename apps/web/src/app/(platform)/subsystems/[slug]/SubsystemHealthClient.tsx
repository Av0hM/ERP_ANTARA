"use client";

import { useEffect, useState } from "react";
import { TaskPriority, TaskStatus } from "@antara/contracts";
import { AlertTriangle, Clock, Users, TrendingUp, Zap, ArrowLeftRight, ArrowRight, ArrowLeft, FileText, MessageSquare } from "lucide-react";

import { useSubsystemHealth } from "@/hooks/use-operations";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SubsystemHealthClientProps {
  slug: string;
}

export function SubsystemHealthClient({ slug }: SubsystemHealthClientProps) {
  const { data, isLoading, error } = useSubsystemHealth(slug);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="section-dark grid-texture-dark rounded-[2rem] p-6 animate-pulse">
          <div className="h-8 w-48 bg-white/10 rounded-xl" />
          <div className="mt-4 h-4 w-64 bg-white/10 rounded-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-dark rounded-[1.25rem] p-6 animate-pulse">
              <div className="h-4 w-24 bg-white/10 rounded-xl" />
              <div className="mt-3 h-10 w-16 bg-white/10 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="section-dark grid-texture-dark rounded-[2rem] p-8 text-center">
        <AlertTriangle className="size-12 text-red-400 mx-auto" />
        <p className="mt-4 text-lg text-muted">Failed to load subsystem health</p>
      </div>
    );
  }

  const { subsystem, metrics, incomingBlockers, outgoingBlockers, workload, recentActivity } = data;

  const criticalPathCount = 0; // Would come from dependency graph

  return (
    <div className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white"
              style={{ backgroundColor: subsystem.color }}
            >
              {subsystem.name.charAt(0)}
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-saffron">Subsystem Command Center</p>
              <h1 className="mt-1 text-3xl font-semibold">{subsystem.name}</h1>
              <p className="mt-1 text-sm text-muted">{subsystem.memberCount} members</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          metric={{
            label: "Velocity",
            value: `${metrics.velocity}%`,
            trend: "up",
            icon: TrendingUp,
          }}
        />
        <MetricCard
          metric={{
            label: "Risk Score",
            value: `${metrics.riskScore}`,
            trend: metrics.riskScore > 60 ? "down" : "up",
            icon: AlertTriangle,
          }}
        />
        <MetricCard
          metric={{
            label: "Completion",
            value: `${metrics.completionRate}%`,
            trend: "up",
            icon: FileText,
          }}
        />
        <MetricCard
          metric={{
            label: "Active Tasks",
            value: String(metrics.activeTaskCount),
            icon: Zap,
          }}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <article className="card-dark rounded-[1.25rem] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Upcoming Deadlines</h2>
              <span className="text-xs text-saffron">{metrics.upcomingDeadlines.length} tasks</span>
            </div>
            {metrics.upcomingDeadlines.length === 0 ? (
              <p className="text-sm text-muted">No upcoming deadlines in the next 7 days</p>
            ) : (
              <div className="space-y-3">
                {metrics.upcomingDeadlines.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      "rounded-xl border border-steel/30 bg-white/5 p-4 flex items-center justify-between",
                      task.priority === TaskPriority.CRITICAL && "border-red-500/30",
                      task.priority === TaskPriority.HIGH && "border-amber-500/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          task.priority === TaskPriority.CRITICAL && "bg-red-500/20 text-red-400",
                          task.priority === TaskPriority.HIGH && "bg-amber-500/20 text-amber-400",
                          task.priority === TaskPriority.MEDIUM && "bg-blue-500/20 text-blue-400",
                          task.priority === TaskPriority.LOW && "bg-slate-500/20 text-slate-400",
                        )}
                      >
                        {task.priority}
                      </span>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-xs text-muted">
                          {new Date(task.deadline).toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="card-dark rounded-[1.25rem] p-6">
            <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-muted">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    className="rounded-xl border border-steel/30 bg-white/5 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "flex size-8 items-center justify-center rounded-xl shrink-0",
                          activity.type === "worklog" && "bg-blue-500/20 text-blue-400",
                          activity.type === "comment" && "bg-purple-500/20 text-purple-400",
                        )}
                      >
                        {activity.type === "worklog" ? (
                          <Clock className="size-4" />
                        ) : (
                          <MessageSquare className="size-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text">{activity.summary}</p>
                        <p className="mt-1 text-xs text-muted">
                          {new Date(activity.timestamp).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>

        <div className="space-y-6">
          <article className="card-dark rounded-[1.25rem] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ArrowLeftRight className="size-5 text-saffron" />
                Cross-Subsystem Blockers
              </h2>
              <span className="text-xs text-saffron">
                {incomingBlockers.length + outgoingBlockers.length} total
              </span>
            </div>

            {incomingBlockers.length > 0 && (
              <div className="space-y-3 mb-6">
                <h3 className="text-sm font-medium text-red-400 flex items-center gap-1">
                  <ArrowRight className="size-4" />
                  Incoming ({incomingBlockers.length})
                </h3>
                {incomingBlockers.map((blocker) => (
                  <div
                    key={blocker.taskId}
                    className="rounded-xl border border-red-500/30 bg-red-500/5 p-3"
                  >
                    <p className="font-medium text-sm">{blocker.title}</p>
                    <p className="text-xs text-muted mt-1">
                      Blocked by <span className="text-red-400">{blocker.blockingTask}</span> in{" "}
                      <span className="font-medium">{blocker.fromSubsystem}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {outgoingBlockers.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-blue-400 flex items-center gap-1">
                  <ArrowLeft className="size-4" />
                  Outgoing ({outgoingBlockers.length})
                </h3>
                {outgoingBlockers.map((blocker) => (
                  <div
                    key={blocker.taskId}
                    className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3"
                  >
                    <p className="font-medium text-sm">{blocker.title}</p>
                    <p className="text-xs text-muted mt-1">
                      Blocking <span className="text-blue-400">{blocker.dependentTask}</span> in{" "}
                      <span className="font-medium">{blocker.toSubsystem}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {(incomingBlockers.length === 0 && outgoingBlockers.length === 0) && (
              <div className="text-center py-8 text-muted">
                <ArrowLeftRight className="size-12 mx-auto mb-3 opacity-30" />
                <p>No cross-subsystem blockers detected</p>
              </div>
            )}
          </article>

          <article className="card-dark rounded-[1.25rem] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Users className="size-5 text-saffron" />
                Workload Balance
              </h2>
              <span className="text-xs text-saffron">{workload.length} members</span>
            </div>
            {workload.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">No members in this subsystem</p>
            ) : (
              <div className="space-y-3">
                {workload.map((member) => (
                  <div
                    key={member.memberId}
                    className="rounded-xl border border-steel/30 bg-white/5 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-saffron/20 flex items-center justify-center text-saffron text-sm font-medium">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{member.name}</p>
                          <p className="text-xs text-muted">{member.activeTasks} active tasks</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold text-saffron">{member.availabilityScore}%</p>
                        <p className="text-xs text-muted">Availability</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-saffron/50 rounded-full transition-all"
                        style={{ width: `${member.availabilityScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}