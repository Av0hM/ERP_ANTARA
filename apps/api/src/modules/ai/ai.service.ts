import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { InsightSeverity, TaskPriority, TaskStatus } from "@antara/contracts";

import { RedisCacheService } from "../../common/cache/redis-cache.service";
import { OpenAiIntegrationService } from "../../common/integrations/openai.integration.service";
import { PrismaService } from "../../common/prisma/prisma.service";

type TaskSnapshot = {
  id: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  deadline: Date;
  dependencyIds: string[];
  estimatedHours: number;
  subsystem: { name: string };
  assignedTo: { id: string; name: string; availabilityScore: number } | null;
};

type WorklogSnapshot = {
  durationMin: number;
  userId: string;
  user: { name: string };
};

type EventSnapshot = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  subsystem: { name: string } | null;
};

type PersistedInsight = {
  id: string;
  title: string;
  summary: string;
  severity: InsightSeverity;
  recommendation: string;
  riskScore: number;
  subsystem: { name: string } | null;
  createdAt: Date;
};

type GeneratedInsight = {
  id: string;
  title: string;
  summary: string;
  severity: InsightSeverity;
  recommendation: string;
  riskScore: number;
  subsystem?: string;
};

type OpenAiInsight = {
  id: string;
  title: string;
  summary: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  recommendation: string;
  riskScore: number;
  subsystem?: string;
};

function toTaskSnapshot(task: any): TaskSnapshot {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority as any,
    status: task.status as any,
    deadline: task.deadline,
    dependencyIds: task.dependencyIds,
    estimatedHours: Number(task.estimatedHours ?? 0),
    subsystem: { name: task.subsystem?.name },
    assignedTo: task.assignedTo
      ? { id: task.assignedTo.id, name: task.assignedTo.name, availabilityScore: task.assignedTo.availabilityScore }
      : null,
  };
}

function toWorklogSnapshot(log: any): WorklogSnapshot {
  return {
    durationMin: log.durationMin,
    userId: log.userId,
    user: { name: log.user?.name },
  };
}

function toEventSnapshot(event: any): EventSnapshot {
  return {
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    subsystem: event.subsystem ? { name: event.subsystem.name } : null,
  };
}

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly openAiIntegration: OpenAiIntegrationService,
    private readonly cache: RedisCacheService,
  ) {}

  async summarizeText(input: { text: string; context?: string }) {
    const cacheKey = `ai:summarize:${createHash("sha1").update(`${input.context ?? ""}:${input.text}`).digest("hex")}`;
    const cached = await this.cache.getJson<{ summary: string; source: "openai" | "local" }>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const summary = await this.openAiIntegration.summarize(input.text, input.context);
      if (summary) {
        const payload = {
          summary,
          source: "openai",
        };
        await this.cache.setJson(cacheKey, payload, 600);
        return payload;
      }
    } catch {
      // Fall through to deterministic summary below.
    }

    const payload = {
      summary: this.buildSeedSummary(input.text, input.context),
      source: "local",
    };
    await this.cache.setJson(cacheKey, payload, 600);
    return payload;
  }

  async getInsights() {
    const cacheKey = "ai:insights";
    const cached = await this.cache.getJson<GeneratedInsight[]>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);

      const [tasks, storedInsights, recentWorklogs, subsystems] = await Promise.all([
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            isArchived: false,
            status: { not: TaskStatus.COMPLETED },
          },
          include: {
            subsystem: { select: { name: true } },
            assignedTo: { select: { id: true, name: true, availabilityScore: true } },
          },
        }),
        this.prisma.aIInsight.findMany({
          take: 3,
          orderBy: { createdAt: "desc" },
          include: {
            subsystem: { select: { name: true } },
          },
        }),
        this.prisma.workLog.findMany({
          where: {
            startedAt: {
              gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
          },
          include: {
            user: { select: { name: true } },
          },
        }),
        this.prisma.subsystem.findMany({
          select: {
            id: true,
            name: true,
          },
        }),
      ]);

      // Try OpenAI function calling first
      let derivedInsights: GeneratedInsight[] = [];
      try {
        derivedInsights = await this.generateInsightsWithOpenAI(
          tasks.map(toTaskSnapshot),
          recentWorklogs.map(toWorklogSnapshot),
          now,
        );
      } catch {
        // Fallback to deterministic heuristics
        derivedInsights = this.buildInsights(
          tasks.map(toTaskSnapshot),
          recentWorklogs.map(toWorklogSnapshot),
          now,
        );
      }

      await this.persistInsights(derivedInsights, storedInsights as PersistedInsight[], subsystems, dayStart);

      const persisted = (storedInsights as PersistedInsight[]).map((insight) => ({
        id: insight.id,
        title: insight.title,
        summary: insight.summary,
        severity: insight.severity,
        recommendation: insight.recommendation,
        riskScore: Number(insight.riskScore),
        subsystem: insight.subsystem?.name,
      }));

      const insights = [...derivedInsights, ...persisted]
        .sort((left, right) => right.riskScore - left.riskScore)
        .slice(0, 6);

      const payload = insights.length ? insights : this.getSeedInsights();
      await this.cache.setJson(cacheKey, payload, 300);
      return payload;
    } catch {
      const payload = this.getSeedInsights();
      await this.cache.setJson(cacheKey, payload, 120);
      return payload;
    }
  }

  private async generateInsightsWithOpenAI(
    tasks: TaskSnapshot[],
    recentWorklogs: WorklogSnapshot[],
    now: Date,
  ): Promise<GeneratedInsight[]> {
    const activeTasks = tasks.filter((t) => t.status !== TaskStatus.COMPLETED);
    const overdueTasks = activeTasks.filter((t) => t.deadline.getTime() < now.getTime());
    const blockedTasks = activeTasks.filter((t) => t.status === TaskStatus.BLOCKED);
    const highPriorityTasks = activeTasks.filter((t) => t.priority === TaskPriority.CRITICAL || t.priority === TaskPriority.HIGH);

    const workloadByUser = recentWorklogs.reduce<Record<string, { name: string; minutes: number }>>((acc, log) => {
      const current = acc[log.userId] ?? { name: log.user.name, minutes: 0 };
      current.minutes += log.durationMin;
      acc[log.userId] = current;
      return acc;
    }, {});

    const topWorklogUsers = Object.entries(workloadByUser)
      .map(([userId, entry]) => ({
        id: userId,
        ...entry,
        activeTasks: tasks.filter((task) => task.assignedTo?.id === userId).length,
      }))
      .sort((left, right) => right.minutes - left.minutes)
      .slice(0, 5);

    const subsystemWorkload = activeTasks.reduce<Record<string, { taskCount: number; totalHours: number }>>((acc, task) => {
      const current = acc[task.subsystem.name] ?? { taskCount: 0, totalHours: 0 };
      current.taskCount += 1;
      current.totalHours += Number(task.estimatedHours ?? 0);
      acc[task.subsystem.name] = current;
      return acc;
    }, {});

    const systemPrompt = `You are an AI operations analyst for a student CubeSat engineering team (20+ members across Software, Avionics, Structures, Payload, Communications, Thermal, Ground Station subsystems). 
Analyze the provided task/worklog data and generate 3-5 actionable insights with risk scores (0-99).

Each insight must have:
- id: unique identifier
- title: concise headline (max 60 chars)
- summary: 1-2 sentences describing the risk
- severity: "INFO" | "WARNING" | "CRITICAL"
- recommendation: specific, actionable mitigation
- riskScore: 0-99 (higher = more urgent)
- subsystem: optional subsystem name

Focus on: deadline slips, dependency chain blockages, workload imbalances, burnout indicators, cross-subsystem coordination risks.`;

    const userPrompt = `Current time: ${now.toISOString()}

Active tasks: ${activeTasks.length}
Overdue tasks: ${overdueTasks.length}
Blocked tasks: ${blockedTasks.length}
High priority (CRITICAL/HIGH): ${highPriorityTasks.length}

Task details:
${activeTasks
  .slice(0, 20)
  .map((t) => `- ${t.title} [${t.subsystem.name}] ${t.status} ${t.priority} deadline:${t.deadline.toISOString().split("T")[0]} est:${t.estimatedHours}h deps:${t.dependencyIds.length} assignee:${t.assignedTo?.name ?? "unassigned"}`)
  .join("\n")}

Recent worklogs (7 days):
${topWorklogUsers.map((u) => `- ${u.name}: ${Math.round(u.minutes / 60)}h across ${u.activeTasks} tasks`).join("\n")}

Subsystem workload:
${Object.entries(subsystemWorkload).map(([name, s]) => `- ${name}: ${s.taskCount} tasks, ${Math.round(s.totalHours)}h`).join("\n")}

Generate insights as a function call to "generate_insights".`;

    const functions = [
      {
        name: "generate_insights",
        description: "Generate operational insights for engineering team",
        parameters: {
          type: "object",
          properties: {
            insights: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  summary: { type: "string" },
                  severity: { type: "string", enum: ["INFO", "WARNING", "CRITICAL"] },
                  recommendation: { type: "string" },
                  riskScore: { type: "number", minimum: 0, maximum: 99 },
                  subsystem: { type: "string" },
                },
                required: ["id", "title", "summary", "severity", "recommendation", "riskScore"],
              },
            },
          },
        },
        required: ["insights"],
      },
    ];

    try {
      const result = await this.openAiIntegration.callWithFunctions({
        systemPrompt,
        userPrompt,
        functions,
        functionCall: { name: "generate_insights" },
      });

      if (result.functionCall) {
        const parsed = JSON.parse(result.functionCall.arguments) as { insights: OpenAiInsight[] };
        return parsed.insights.map((insight) => ({
          id: insight.id,
          title: insight.title,
          summary: insight.summary,
          severity: insight.severity as InsightSeverity,
          recommendation: insight.recommendation,
          riskScore: insight.riskScore,
          subsystem: insight.subsystem,
        }));
      }
    } catch {
      // Fall through to heuristics
    }

    // Fallback to deterministic heuristics
    return this.buildInsights(tasks, recentWorklogs, now);
  }

  async getSmartReminders() {
    const cacheKey = "ai:reminders";
    const cached = await this.cache.getJson<Array<{ id: string; message: string; priority: string }>>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const soon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const tasks = await this.prisma.task.findMany({
        where: {
          deletedAt: null,
          isArchived: false,
          status: {
            notIn: [TaskStatus.COMPLETED],
          },
          OR: [{ deadline: { lte: soon } }, { status: TaskStatus.BLOCKED }],
        },
        orderBy: [{ priority: "desc" }, { deadline: "asc" }],
        include: {
          subsystem: { select: { name: true } },
          assignedTo: { select: { name: true } },
        },
        take: 6,
      });

      const reminders = tasks.map(toTaskSnapshot).map((task: TaskSnapshot) => {
        const overdue = task.deadline.getTime() < now.getTime();
        const dueHours = Math.max(1, Math.round((task.deadline.getTime() - now.getTime()) / (60 * 60 * 1000)));
        const dependencyNote = task.dependencyIds.length
          ? ` ${task.dependencyIds.length} dependency link${task.dependencyIds.length > 1 ? "s are" : " is"} in play.`
          : "";

        return {
          id: `reminder-${task.id}`,
          message: overdue
            ? `${task.subsystem.name} task "${task.title}" is overdue. Immediate recovery planning is recommended.${dependencyNote}`
            : `${task.assignedTo?.name ?? "Assigned member"} has ${dueHours}h left on "${task.title}" in ${task.subsystem.name}.${dependencyNote}`,
          priority:
            task.priority === TaskPriority.CRITICAL || overdue
              ? "HIGH"
              : task.priority === TaskPriority.HIGH
                ? "MEDIUM"
                : "LOW",
        };
      });

      const payload = reminders.length ? reminders : this.getSeedReminders();
      await this.cache.setJson(cacheKey, payload, 300);
      return payload;
    } catch {
      const payload = this.getSeedReminders();
      await this.cache.setJson(cacheKey, payload, 120);
      return payload;
    }
  }

  async getSchedulingRecommendations() {
    const cacheKey = "ai:schedule";
    const cached = await this.cache.getJson<Array<{ id: string; title: string; reason: string }>>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const [events, dueTasks] = await Promise.all([
        this.prisma.calendarEvent.findMany({
          where: {
            startsAt: { gte: now, lte: horizon },
          },
          orderBy: { startsAt: "asc" },
          include: {
            subsystem: { select: { name: true } },
          },
          take: 8,
        }),
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            isArchived: false,
            status: { not: TaskStatus.COMPLETED },
            deadline: { gte: now, lte: horizon },
          },
          orderBy: [{ priority: "desc" }, { deadline: "asc" }],
          include: {
            subsystem: { select: { name: true } },
          },
          take: 8,
        }),
      ]);

      const recommendations = this.buildScheduleRecommendations(
        events.map(toEventSnapshot),
        dueTasks.map(toTaskSnapshot),
      );

      const payload = recommendations.length ? recommendations : this.getSeedSchedule();
      await this.cache.setJson(cacheKey, payload, 300);
      return payload;
    } catch {
      const payload = this.getSeedSchedule();
      await this.cache.setJson(cacheKey, payload, 120);
      return payload;
    }
  }

  async getWorkloadSuggestions() {
    const cacheKey = "ai:workload";
    const cached = await this.cache.getJson<Array<{ id: string; from: string; to: string; reason: string }>>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const tasks = await this.prisma.task.findMany({
        where: {
          deletedAt: null,
          isArchived: false,
          status: {
            notIn: [TaskStatus.COMPLETED],
          },
        },
        include: {
          subsystem: { select: { name: true } },
          assignedTo: { select: { id: true, name: true, availabilityScore: true } },
        },
      });

      const suggestions = this.buildWorkloadSuggestions(tasks.map(toTaskSnapshot));
      const payload = suggestions.length ? suggestions : this.getSeedWorkload();
      await this.cache.setJson(cacheKey, payload, 300);
      return payload;
    } catch {
      const payload = this.getSeedWorkload();
      await this.cache.setJson(cacheKey, payload, 120);
      return payload;
    }
  }

  async getBundle() {
    const [insights, reminders, schedule, workload] = await Promise.all([
      this.getInsights(),
      this.getSmartReminders(),
      this.getSchedulingRecommendations(),
      this.getWorkloadSuggestions(),
    ]);

    return { insights, reminders, schedule, workload };
  }

  private async persistInsights(
    insights: GeneratedInsight[],
    storedInsights: PersistedInsight[],
    subsystems: Array<{ id: string; name: string }>,
    dayStart: Date,
  ) {
    const existingKeys = new Set(
      storedInsights
        .filter((insight) => insight.createdAt >= dayStart)
        .map((insight) => `${insight.title}::${insight.subsystem?.name ?? ""}`),
    );
    const subsystemMap = new Map(subsystems.map((subsystem) => [subsystem.name, subsystem.id]));

    const records = insights
      .filter((insight) => !existingKeys.has(`${insight.title}::${insight.subsystem ?? ""}`))
      .map((insight) => ({
        title: insight.title,
        summary: insight.summary,
        severity: insight.severity,
        recommendation: insight.recommendation,
        riskScore: insight.riskScore,
        subsystemId: insight.subsystem ? subsystemMap.get(insight.subsystem) ?? null : null,
        actorId: null,
      }));

    if (!records.length) {
      return;
    }

    await this.prisma.aIInsight.createMany({
      data: records,
    });
  }

  private buildInsights(tasks: TaskSnapshot[], recentWorklogs: WorklogSnapshot[], now: Date) {
    const insights: GeneratedInsight[] = [];

    const overdueTasks = tasks
      .filter((task) => task.deadline.getTime() < now.getTime())
      .sort((left, right) => this.priorityWeight(right.priority) - this.priorityWeight(left.priority));

    if (overdueTasks.length) {
      const top = overdueTasks[0];
      if (!top) {
        return insights;
      }
      insights.push({
        id: `overdue-${top.id}`,
        title: `${top.subsystem.name} deadline slip risk`,
        severity: top.priority === TaskPriority.CRITICAL ? InsightSeverity.CRITICAL : InsightSeverity.WARNING,
        summary: `${overdueTasks.length} active task${overdueTasks.length > 1 ? "s are" : " is"} already past deadline, led by "${top.title}".`,
        recommendation: "Recover schedule by narrowing scope, reassigning verification support, and revising the next integration checkpoint.",
        riskScore: Math.min(99, 68 + overdueTasks.length * 8 + this.priorityWeight(top.priority) * 4),
        subsystem: top.subsystem.name,
      });
    }

    const blockedTasks = tasks
      .filter((task) => task.status === TaskStatus.BLOCKED)
      .sort((left, right) => right.dependencyIds.length - left.dependencyIds.length);

    if (blockedTasks.length) {
      const top = blockedTasks[0];
      if (!top) {
        return insights;
      }
      insights.push({
        id: `blocked-${top.id}`,
        title: "Dependency chain blockage detected",
        severity: top.dependencyIds.length >= 2 ? InsightSeverity.CRITICAL : InsightSeverity.WARNING,
        summary: `"${top.title}" is blocked with ${top.dependencyIds.length || 1} dependency gate${top.dependencyIds.length === 1 ? "" : "s"} still unresolved.`,
        recommendation: "Convert blocked dependencies into named owners and clear the highest-impact prerequisite before the next subsystem sync.",
        riskScore: Math.min(96, 62 + top.dependencyIds.length * 10 + this.priorityWeight(top.priority) * 3),
        subsystem: top.subsystem.name,
      });
    }

    const workload = this.aggregateAssigneeLoad(tasks);
    const overloaded = workload[0];
    const underloaded = workload[workload.length - 1];

    if (overloaded && underloaded && overloaded.activeTasks - underloaded.activeTasks >= 2) {
      insights.push({
        id: `imbalance-${overloaded.id}`,
        title: "Contributor load imbalance",
        severity: InsightSeverity.INFO,
        summary: `${overloaded.name} is carrying ${overloaded.activeTasks} active tasks while ${underloaded.name} has ${underloaded.activeTasks}.`,
        recommendation: `Shift lower-risk review or documentation work away from ${overloaded.name} to improve completion resilience.`,
        riskScore: 48 + (overloaded.activeTasks - underloaded.activeTasks) * 6,
      });
    }

    const worklogByUser = recentWorklogs.reduce<Record<string, { name: string; minutes: number }>>((acc, log) => {
      const current = acc[log.userId] ?? { name: log.user.name, minutes: 0 };
      current.minutes += log.durationMin;
      acc[log.userId] = current;
      return acc;
    }, {});

    const burnoutCandidate = Object.entries(worklogByUser)
      .map(([userId, entry]) => ({
        id: userId,
        ...entry,
        activeTasks: tasks.filter((task) => task.assignedTo?.id === userId).length,
      }))
      .sort((left, right) => right.minutes - left.minutes)[0];

    if (burnoutCandidate && burnoutCandidate.minutes >= 480 && burnoutCandidate.activeTasks >= 2) {
      insights.push({
        id: `burnout-${burnoutCandidate.id}`,
        title: "Burnout indicator rising",
        severity: InsightSeverity.WARNING,
        summary: `${burnoutCandidate.name} logged ${Math.round(burnoutCandidate.minutes / 60)}h this week across ${burnoutCandidate.activeTasks} active tasks.`,
        recommendation: "Protect integration quality by redistributing one task and keeping the next review scoped to blocker resolution only.",
        riskScore: Math.min(92, 50 + Math.round(burnoutCandidate.minutes / 30) + burnoutCandidate.activeTasks * 4),
      });
    }

    return insights;
  }

  private buildScheduleRecommendations(events: EventSnapshot[], dueTasks: TaskSnapshot[]) {
    const recommendations: Array<{ id: string; title: string; reason: string }> = [];

    const byDay = events.reduce<Record<string, EventSnapshot[]>>((acc, event) => {
      const key = event.startsAt.toISOString().slice(0, 10);
      acc[key] = [...(acc[key] ?? []), event];
      return acc;
    }, {});

    const overloadedDay = Object.entries(byDay)
      .map(([day, dayEvents]) => ({ day, count: dayEvents.length, events: dayEvents }))
      .sort((left, right) => right.count - left.count)[0];

    if (overloadedDay && overloadedDay.count >= 2) {
      const event = overloadedDay.events[0];
      if (!event) {
        return recommendations;
      }
      recommendations.push({
        id: `schedule-${event.id}`,
        title: `Spread ${event.title} away from ${overloadedDay.day}`,
        reason: `There are ${overloadedDay.count} calendar events stacked on that day, which increases context switching before engineering reviews.`,
      });
    }

    const criticalDue = dueTasks
      .filter((task) => task.priority === TaskPriority.CRITICAL || task.priority === TaskPriority.HIGH)
      .sort((left, right) => left.deadline.getTime() - right.deadline.getTime())[0];

    if (criticalDue) {
      recommendations.push({
        id: `due-${criticalDue.id}`,
        title: `Protect focus time ahead of ${criticalDue.title}`,
        reason: `${criticalDue.subsystem.name} has a high-priority deadline approaching, so reducing meeting load in the preceding 24 hours lowers execution risk.`,
      });
    }

    return recommendations.slice(0, 4);
  }

  private buildWorkloadSuggestions(tasks: TaskSnapshot[]) {
    const bySubsystem = tasks.reduce<Record<string, { totalHours: number; taskCount: number }>>((acc, task) => {
      const current = acc[task.subsystem.name] ?? { totalHours: 0, taskCount: 0 };
      current.totalHours += Number(task.estimatedHours ?? 0);
      current.taskCount += 1;
      acc[task.subsystem.name] = current;
      return acc;
    }, {});

    const ranked = Object.entries(bySubsystem)
      .map(([name, summary]) => ({ name, ...summary }))
      .sort((left, right) => right.totalHours - left.totalHours);

    if (ranked.length < 2) {
      return this.getSeedWorkload();
    }

    const heaviest = ranked[0];
    const lightest = ranked[ranked.length - 1];
    if (!heaviest || !lightest) {
      return this.getSeedWorkload();
    }

    return [
      {
        id: `workload-${heaviest.name}-${lightest.name}`,
        from: heaviest.name,
        to: lightest.name,
        reason: `${heaviest.name} is carrying ${heaviest.taskCount} active tasks across ${Math.round(heaviest.totalHours)}h of estimated effort, while ${lightest.name} is lighter at ${Math.round(lightest.totalHours)}h.`,
      },
    ];
  }

  async getScheduleRisk(horizonDays = 14, simulations = 1000) {
    const cacheKey = `ai:schedule-risk:${horizonDays}:${simulations}`;
    const cached = await this.cache.getJson<any>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const now = new Date();
      const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

      const [tasks, worklogs] = await Promise.all([
        this.prisma.task.findMany({
          where: {
            deletedAt: null,
            isArchived: false,
            status: { not: TaskStatus.COMPLETED },
            deadline: { gte: now, lte: horizon },
          },
          include: {
            subsystem: { select: { name: true } },
            assignedTo: { select: { id: true, name: true, availabilityScore: true } },
          },
          orderBy: [{ priority: "desc" }, { deadline: "asc" }],
        }),
        this.prisma.workLog.findMany({
          where: {
            startedAt: {
              gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            },
          },
          include: {
            user: { select: { id: true } },
            task: { select: { estimatedHours: true } },
          },
        }),
      ]);

      const riskResult = this.runMonteCarloScheduleRisk(
        tasks.map(toTaskSnapshot),
        worklogs as Array<{
          durationMin: number;
          userId: string;
          task: { estimatedHours: number | string } | null;
        }>,
        now,
        horizon,
        simulations,
      );

      const payload = riskResult;
      await this.cache.setJson(cacheKey, payload, 300);
      return payload;
    } catch {
      return this.getSeedScheduleRisk();
    }
  }

  private runMonteCarloScheduleRisk(
    tasks: TaskSnapshot[],
    historicalWorklogs: Array<{
      durationMin: number;
      userId: string;
      task: { estimatedHours: number | string } | null;
    }>,
    now: Date,
    horizon: Date,
    simulations: number,
  ) {
    // Calculate historical velocity variance per user
    const userVelocity = historicalWorklogs.reduce<Record<string, { durations: number[]; estimatedHours: number[] }>>(
      (acc, log) => {
        if (!log.task?.estimatedHours) return acc;
        const estimated = Number(log.task.estimatedHours);
        const actual = log.durationMin / 60;
        const current = acc[log.userId] ?? { durations: [], estimatedHours: [] };
        current.durations.push(actual);
        current.estimatedHours.push(estimated);
        acc[log.userId] = current;
        return acc;
      },
      {},
    );

    const userVariance: Record<string, number> = {};
    for (const [userId, data] of Object.entries(userVelocity)) {
      if (data.durations.length >= 2) {
        const ratios = data.durations.map((d, i) => d / (data.estimatedHours[i] || 1));
        const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        const variance = ratios.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratios.length;
        userVariance[userId] = Math.max(0.1, Math.min(2.0, variance));
      } else {
        userVariance[userId] = 0.3; // Default variance
      }
    }

    const taskCompletionTimes: Record<string, number[]> = {};

    for (let sim = 0; sim < simulations; sim++) {
      let currentTime = now.getTime();
      const taskEndTimes: Record<string, number> = {};

      // Sort tasks by priority and deadline for scheduling order
      const sortedTasks = [...tasks].sort((a, b) => {
        const priorityDiff = this.priorityWeight(b.priority) - this.priorityWeight(a.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return a.deadline.getTime() - b.deadline.getTime();
      });

      for (const task of sortedTasks) {
        const estimatedHours = Number(task.estimatedHours ?? 1);
        const assignee = task.assignedTo?.id;
        const variance = assignee && userVariance[assignee] ? userVariance[assignee] : 0.3;
        
        // Sample from log-normal distribution for task duration
        const meanLog = Math.log(estimatedHours) - 0.5 * variance * variance;
        const sampledHours = Math.exp(meanLog + Math.sqrt(variance) * this.boxMuller());
        const taskDurationMs = Math.max(0.5, sampledHours) * 60 * 60 * 1000;

        // Account for dependencies
        let earliestStart = currentTime;
        for (const depId of task.dependencyIds ?? []) {
          if (taskEndTimes[depId]) {
            earliestStart = Math.max(earliestStart, taskEndTimes[depId]);
          }
        }

        const endTime = earliestStart + taskDurationMs;
        taskEndTimes[task.id] = endTime;
        currentTime = Math.max(currentTime, endTime);

        // Track completion time for this task
        if (!taskCompletionTimes[task.id]) {
          taskCompletionTimes[task.id] = [];
        }
        taskCompletionTimes[task.id]!.push(endTime);
      }

      // Record horizon exceedance
      for (const [taskId, endTime] of Object.entries(taskEndTimes)) {
        if (endTime > horizon.getTime()) {
          if (!taskCompletionTimes[taskId]) taskCompletionTimes[taskId] = [];
          taskCompletionTimes[taskId].push(endTime);
        }
      }
    }

    // Calculate percentiles
    const results = Object.entries(taskCompletionTimes).map(([taskId, times]) => {
      const sorted = times.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      const overdueProb = times.filter((t) => t > horizon.getTime()).length / times.length;
      
      const task = tasks.find((t) => t.id === taskId);
      return {
        taskId,
        title: task?.title ?? "Unknown",
        subsystem: task?.subsystem.name ?? "Unknown",
        priority: task?.priority ?? TaskPriority.MEDIUM,
        deadline: task?.deadline.toISOString(),
        p50Completion: p50 ? new Date(p50).toISOString() : null,
        p90Completion: p90 ? new Date(p90).toISOString() : null,
        overdueProbability: Math.round(overdueProb * 100),
        riskLevel: overdueProb > 0.5 ? "CRITICAL" : overdueProb > 0.2 ? "HIGH" : overdueProb > 0.05 ? "MEDIUM" : "LOW",
      };
    });

    // Overall project risk
    const totalOverdue = results.filter((r) => r.overdueProbability > 50).length;
    const highRiskCount = results.filter((r) => r.riskLevel === "CRITICAL" || r.riskLevel === "HIGH").length;

    return {
      taskRisks: results.sort((a, b) => b.overdueProbability - a.overdueProbability),
      summary: {
        totalTasks: results.length,
        tasksAtRisk: totalOverdue,
        highRiskTasks: highRiskCount,
        projectP50Completion: this.getOverallP50(taskCompletionTimes),
        projectP90Completion: this.getOverallP90(taskCompletionTimes),
        horizon: horizon.toISOString(),
      },
    };
  }

  private getOverallP50(taskCompletionTimes: Record<string, number[]>): string | null {
    const allEndTimes = Object.values(taskCompletionTimes).flat();
    if (allEndTimes.length === 0) return null;
    const sorted = allEndTimes.sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)];
    return median ? new Date(median).toISOString() : null;
  }

  private getOverallP90(taskCompletionTimes: Record<string, number[]>): string | null {
    const allEndTimes = Object.values(taskCompletionTimes).flat();
    if (allEndTimes.length === 0) return null;
    const sorted = allEndTimes.sort((a, b) => a - b);
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    return p90 ? new Date(p90).toISOString() : null;
  }

  private boxMuller(): number {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  private getSeedScheduleRisk() {
    return {
      taskRisks: [],
      summary: {
        totalTasks: 0,
        tasksAtRisk: 0,
        highRiskTasks: 0,
        projectP50Completion: null,
        projectP90Completion: null,
        horizon: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  private aggregateAssigneeLoad(tasks: TaskSnapshot[]) {
    return Object.values(
      tasks.reduce<Record<string, { id: string; name: string; activeTasks: number; availabilityScore: number }>>((acc, task) => {
        if (!task.assignedTo) {
          return acc;
        }

        const current = acc[task.assignedTo.id] ?? {
          id: task.assignedTo.id,
          name: task.assignedTo.name,
          activeTasks: 0,
          availabilityScore: task.assignedTo.availabilityScore,
        };

        current.activeTasks += 1;
        current.availabilityScore = task.assignedTo.availabilityScore;
        acc[task.assignedTo.id] = current;
        return acc;
      }, {}),
    ).sort((left, right) => {
      if (right.activeTasks !== left.activeTasks) {
        return right.activeTasks - left.activeTasks;
      }
      return left.availabilityScore - right.availabilityScore;
    });
  }

  private priorityWeight(priority: TaskPriority) {
    switch (priority) {
      case TaskPriority.CRITICAL:
        return 4;
      case TaskPriority.HIGH:
        return 3;
      case TaskPriority.MEDIUM:
        return 2;
      default:
        return 1;
    }
  }

  private getSeedInsights() {
    return [
      {
        id: "ai-1",
        title: "Telemetry integration delay risk",
        severity: InsightSeverity.WARNING,
        summary: "Firmware validation is now on the critical path for avionics-to-ground station verification.",
        recommendation: "Reassign one ground station operator to firmware review and move rehearsal one day later.",
        riskScore: 74,
        subsystem: "Avionics",
      },
      {
        id: "ai-2",
        title: "Workload imbalance detected",
        severity: InsightSeverity.INFO,
        summary: "Payload tasks are concentrated around two contributors. Reassignment could improve schedule resilience.",
        recommendation: "Shift documentation and test prep from payload to structures for one sprint.",
        riskScore: 51,
        subsystem: "Payload",
      },
    ];
  }

  private getSeedReminders() {
    return [
      {
        id: "r1",
        message: "Telemetry integration depends on your firmware task. Delay risk detected.",
        priority: "HIGH",
      },
      {
        id: "r2",
        message: "Payload review is 24 hours away and one prerequisite CAD note is still open.",
        priority: "MEDIUM",
      },
    ];
  }

  private getSeedSchedule() {
    return [
      {
        id: "s1",
        title: "Move payload review to Thursday 5:00 PM",
        reason: "This is the earliest slot with software, payload, and faculty mentor overlap.",
      },
      {
        id: "s2",
        title: "Pull ground station rehearsal forward by 1 day",
        reason: "Comms risk is low and it opens buffer before integration review.",
      },
    ];
  }

  private getSeedWorkload() {
    return [
      {
        id: "w1",
        from: "Payload",
        to: "Structures",
        reason: "Structures has spare capacity and compatible documentation bandwidth.",
      },
      {
        id: "w2",
        from: "Software",
        to: "Ground Station",
        reason: "Ground station can absorb verification scripting with lower deadline pressure.",
      },
    ];
  }

  private buildSeedSummary(text: string, context?: string) {
    const trimmed = text.trim().replace(/\s+/g, " ");
    const excerpt = trimmed.length > 220 ? `${trimmed.slice(0, 220)}...` : trimmed;
    return [context ? `Context: ${context}.` : null, `Summary: ${excerpt}`].filter(Boolean).join(" ");
  }
}

