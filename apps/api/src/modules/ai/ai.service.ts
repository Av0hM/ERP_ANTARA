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
  estimatedHours: number | string;
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
  riskScore: number | string;
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

      const derivedInsights = this.buildInsights(
        tasks as TaskSnapshot[],
        recentWorklogs as WorklogSnapshot[],
        now,
      );

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

      const reminders = (tasks as TaskSnapshot[]).map((task) => {
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
        events as EventSnapshot[],
        dueTasks as TaskSnapshot[],
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

      const suggestions = this.buildWorkloadSuggestions(tasks as TaskSnapshot[]);
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

