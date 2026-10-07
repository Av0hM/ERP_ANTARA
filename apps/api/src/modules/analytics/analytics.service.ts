import { ForbiddenException } from "@nestjs/common";
import { canonicalSubsystems } from "@antara/contracts";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { administeredSubsystemIds } from "../../common/authorization/authorization.policy";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { subsystemCatalog, TaskStatus } from "@antara/contracts";

import { RedisCacheService } from "../../common/cache/redis-cache.service";
import { PrismaService } from "../../common/prisma/prisma.service";

export type AnalyticsScope =
  | { kind: "GLOBAL" }
  | { kind: "SUBSYSTEM"; id: string }
  | { kind: "ADMIN"; ids: string[] }
  | { kind: "PERSONAL"; id: string }
  | { kind: "EMPTY"; id: string };
const globalScope: AnalyticsScope = { kind: "GLOBAL" };
export const scopeKey = (scope: AnalyticsScope) => {
  if (scope.kind === "GLOBAL") return "v4b:OWNER_GLOBAL";
  if (scope.kind === "ADMIN")
    return `v4b:ADMIN:${JSON.stringify([...new Set(scope.ids)].sort())}`;
  return `v4b:${scope.kind === "SUBSYSTEM" ? "OWNER_SUBSYSTEM" : scope.kind}:${scope.id}`;
};

function taskScope(scope: AnalyticsScope): Prisma.TaskWhereInput {
  switch (scope.kind) {
    case "GLOBAL":
      return {};
    case "SUBSYSTEM":
      return { subsystemId: scope.id };
    case "ADMIN":
      return { subsystemId: { in: scope.ids } };
    case "PERSONAL":
      return {
        assignedToId: scope.id,
        subsystem: { memberships: { some: { userId: scope.id } } },
      };
    case "EMPTY":
      return { id: { in: [] } };
  }
}
function worklogScope(scope: AnalyticsScope): Prisma.WorkLogWhereInput {
  switch (scope.kind) {
    case "GLOBAL":
      return {};
    case "SUBSYSTEM":
      return { task: { subsystemId: scope.id } };
    case "ADMIN":
      return { id: { in: [] } };
    case "PERSONAL":
      return { userId: scope.id };
    case "EMPTY":
      return { id: { in: [] } };
  }
}
function userScope(scope: AnalyticsScope): Prisma.UserWhereInput {
  switch (scope.kind) {
    case "GLOBAL":
      return {};
    case "SUBSYSTEM":
      return { memberships: { some: { subsystemId: scope.id } } };
    case "ADMIN":
      return { memberships: { some: { subsystemId: { in: scope.ids } } } };
    case "PERSONAL":
      return { id: scope.id };
    case "EMPTY":
      return { id: { in: [] } };
  }
}

type AnalyticsOverview = {
  productivityIndex: number;
  subsystemVelocity: number;
  overdueRate: number;
  clubHealth: number;
};

type HeatmapCell = { day: string; intensity: number };
type VelocityPoint = { label: string; value: number };
type SubsystemBreakdown = {
  name: string;
  velocity: number;
  risk: number;
  completion: number;
};

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private refreshing = false;
  private readonly refreshIntervalMs = 15 * 60 * 1000;
  private snapshotTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly core: CoreAuthorizationService,
  ) {}

  async onModuleInit() {
    await this.refreshAnalyticsSnapshot();
    this.snapshotTimer = setInterval(() => {
      void this.refreshAnalyticsSnapshot().catch(() =>
        this.logger.error("Analytics snapshot refresh failed"),
      );
    }, this.refreshIntervalMs);
    this.snapshotTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }
  }

  async resolveScope(
    userId: string,
    selectedSubsystemId?: string,
  ): Promise<AnalyticsScope> {
    const actor = await this.core.actor(userId);
    if (actor.roleInconsistency === "MEMBER_WITH_ADMIN_MEMBERSHIP")
      return { kind: "EMPTY", id: userId };
    if (selectedSubsystemId) {
      const subsystem = await this.prisma.subsystem.findFirst({
        where: {
          id: selectedSubsystemId,
          key: { in: canonicalSubsystems.map((s) => s.key) },
        },
        select: { id: true },
      });
      if (!subsystem) throw new ForbiddenException("Analytics scope denied");
      if (actor.globalAuthority) return { kind: "SUBSYSTEM", id: subsystem.id };
      const admin = administeredSubsystemIds(actor);
      if (admin.kind !== "SCOPED" || !admin.ids.includes(subsystem.id))
        throw new ForbiddenException("Analytics scope denied");
      return { kind: "ADMIN", ids: [subsystem.id] };
    }
    if (actor.globalAuthority) return globalScope;
    if (actor.role === "ADMIN") {
      const admin = administeredSubsystemIds(actor);
      return admin.kind === "SCOPED" && admin.ids.length
        ? { kind: "ADMIN", ids: [...admin.ids] }
        : { kind: "EMPTY", id: userId };
    }
    return { kind: "PERSONAL", id: userId };
  }

  getOwnerOverview() {
    return this.getOverview(globalScope);
  }
  getSubsystemOverview(subsystemId: string) {
    return this.getOverview({ kind: "SUBSYSTEM", id: subsystemId });
  }
  getPersonalOverview(userId: string) {
    return this.getOverview({ kind: "PERSONAL", id: userId });
  }

  async getOverview(scope: AnalyticsScope): Promise<AnalyticsOverview> {
    const cacheKey = `analytics:overview:${scopeKey(scope)}`;
    const cached = await this.cache.getJson<AnalyticsOverview>(cacheKey);
    if (cached) return cached;
    const overview = await this.computeOverview(scope);
    await this.cache.setJson(cacheKey, overview, 300);
    return overview;
  }

  async getVelocityTrend(
    scope: AnalyticsScope = globalScope,
  ): Promise<VelocityPoint[]> {
    const cacheKey = `analytics:velocity:${scopeKey(scope)}`;
    const cached = await this.cache.getJson<VelocityPoint[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      where: { scope: scopeKey(scope) },
      take: 8,
      orderBy: { periodStart: "desc" },
    });

    const series =
      snapshots.length > 0
        ? snapshots.reverse().map((snapshot, index) => ({
            label: `P${index + 1}`,
            value: Number(snapshot.velocityScore),
          }))
        : [];

    await this.cache.setJson(cacheKey, series, 300);
    return series;
  }

  async getHeatmap(
    scope: AnalyticsScope = globalScope,
  ): Promise<HeatmapCell[]> {
    const cacheKey = `analytics:heatmap:${scopeKey(scope)}`;
    const cached = await this.cache.getJson<HeatmapCell[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const worklogs = await this.prisma.workLog.findMany({
      where: {
        ...worklogScope(scope),
        startedAt: {
          gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        startedAt: true,
        durationMin: true,
      },
    });

    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const tally = weekdays.map((day) => ({ day, intensity: 0 }));
    for (const worklog of worklogs) {
      const index = worklog.startedAt.getDay();
      tally[index]!.intensity += Math.max(
        1,
        Math.round(worklog.durationMin / 60),
      );
    }

    const heatmap = tally.slice(1).concat(tally[0] ? [tally[0]] : []);
    const normalized = heatmap.map((cell) => ({
      ...cell,
      intensity: Math.min(6, cell.intensity),
    }));

    const result = normalized;
    await this.cache.setJson(cacheKey, result, 300);
    return result;
  }

  async getSubsystemBreakdown(
    scope: AnalyticsScope = globalScope,
  ): Promise<SubsystemBreakdown[]> {
    const cacheKey = `analytics:subsystems:${scopeKey(scope)}`;
    const cached = await this.cache.getJson<SubsystemBreakdown[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        ...taskScope(scope),
        deletedAt: null,
        isArchived: false,
      },
      include: {
        subsystem: { select: { name: true } },
      },
    });

    const names =
      scope.kind === "GLOBAL"
        ? subsystemCatalog
        : [...new Set(tasks.map((task) => task.subsystem.name))];
    const subsystems = names.map((name) => {
      const relevant = tasks.filter((task) => task.subsystem.name === name);
      const completed = relevant.filter(
        (task) => task.status === TaskStatus.COMPLETED,
      ).length;
      const overdue = relevant.filter(
        (task) =>
          task.status === TaskStatus.OVERDUE || task.deadline < new Date(),
      ).length;
      const active = relevant.filter(
        (task) => task.status !== TaskStatus.COMPLETED,
      ).length;
      const totalHours = relevant.reduce(
        (sum, task) => sum + Number(task.estimatedHours ?? 0),
        0,
      );
      return {
        name,
        velocity: Math.min(99, Math.round(55 + completed * 6 + active * 2)),
        risk: Math.min(
          99,
          Math.round(20 + overdue * 12 + active * 3 + totalHours / 2),
        ),
        completion: relevant.length
          ? Math.round((completed / relevant.length) * 100)
          : 0,
      };
    });

    const result = subsystems;
    await this.cache.setJson(cacheKey, result, 300);
    return result;
  }

  async getBundle(scope: AnalyticsScope = globalScope) {
    const [overview, velocity, heatmap, subsystems, insights] =
      await Promise.all([
        this.getOverview(scope),
        this.getVelocityTrend(scope),
        this.getHeatmap(scope),
        this.getSubsystemBreakdown(scope),
        scope.kind === "SUBSYSTEM"
          ? this.prisma.aIInsight.findMany({
              where: { subsystemId: scope.id },
              take: 10,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                title: true,
                summary: true,
                severity: true,
                recommendation: true,
              },
            })
          : Promise.resolve([]),
      ]);
    return {
      overview,
      velocity,
      heatmap,
      subsystems,
      insights,
      scope: scope.kind === "ADMIN" ? "SUBSYSTEM" : scope.kind,
    };
  }

  async refreshAnalyticsSnapshot() {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const users = await this.prisma.user.findMany({
        where: {
          isActive: true,
          deletedAt: null,
          role: { in: ["ADMIN", "MEMBER"] },
        },
        select: { id: true },
      });
      const scopes = new Map<string, AnalyticsScope>([["GLOBAL", globalScope]]);
      for (const user of users) {
        const scope = await this.resolveScope(user.id);
        if (scope.kind !== "EMPTY") scopes.set(scopeKey(scope), scope);
      }
      for (const scope of scopes.values())
        await this.refreshScopeSnapshot(scope);
    } finally {
      this.refreshing = false;
    }
  }

  private async refreshScopeSnapshot(scope: AnalyticsScope) {
    const [overview, velocity, heatmap, subsystems, completedTasks] =
      await Promise.all([
        this.computeOverview(scope),
        this.getVelocityTrend(scope),
        this.getHeatmap(scope),
        this.getSubsystemBreakdown(scope),
        this.prisma.task.findMany({
          where: {
            ...taskScope(scope),
            deletedAt: null,
            isArchived: false,
            status: "COMPLETED",
          },
          select: {
            worklogs: {
              where: worklogScope(scope),
              select: { durationMin: true },
            },
          },
        }),
      ]);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setUTCHours(0, 0, 0, 0);
    periodStart.setUTCDate(periodStart.getUTCDate() - 7);
    const key = scopeKey(scope);
    // Serialize each scope/day across API instances without changing the schema.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key + periodStart.toISOString()}))::text`;
      const existing = await tx.analyticsSnapshot.findFirst({
        where: { scope: key, periodStart },
      });
      const data = {
        periodEnd,
        tasksCompleted: completedTasks.length,
        avgCompletionHours: completedTasks.length
          ? completedTasks.reduce(
              (sum, task) =>
                sum +
                task.worklogs.reduce(
                  (minutes, log) => minutes + log.durationMin,
                  0,
                ),
              0,
            ) /
            60 /
            completedTasks.length
          : 0,
        overduePercentage: overview.overdueRate,
        velocityScore: overview.subsystemVelocity,
        payload: { overview, velocity, heatmap, subsystems },
      };
      if (existing) {
        await tx.analyticsSnapshot.update({ where: { id: existing.id }, data });
      } else {
        await tx.analyticsSnapshot.create({
          data: { scope: key, periodStart, ...data },
        });
      }
    });
    await this.cache.del(`analytics:velocity:${key}`);
  }

  private async computeOverview(
    scope: AnalyticsScope = globalScope,
  ): Promise<AnalyticsOverview> {
    const [tasks, worklogs, users] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          ...taskScope(scope),
          deletedAt: null,
          isArchived: false,
        },
        select: {
          status: true,
          deadline: true,
          priority: true,
        },
      }),
      this.prisma.workLog.findMany({
        where: {
          ...worklogScope(scope),
          startedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          durationMin: true,
        },
      }),
      this.prisma.user.findMany({
        where: {
          ...userScope(scope),
          isActive: true,
        },
        select: {
          availabilityScore: true,
        },
      }),
    ]);

    if (scope.kind !== "GLOBAL" && !tasks.length && !worklogs.length) {
      return {
        productivityIndex: 0,
        subsystemVelocity: 0,
        overdueRate: 0,
        clubHealth: 0,
      };
    }
    const total = tasks.length || 1;
    const completed = tasks.filter(
      (task) => task.status === TaskStatus.COMPLETED,
    ).length;
    const overdue = tasks.filter(
      (task) =>
        task.status === TaskStatus.OVERDUE || task.deadline < new Date(),
    ).length;
    const active = tasks.filter(
      (task) => task.status !== TaskStatus.COMPLETED,
    ).length;
    const velocity = Math.min(
      99,
      Math.round((completed / total) * 100 + active * 1.5),
    );
    const productivity = Math.min(
      99,
      Math.round(
        60 +
          worklogs.reduce((sum, item) => sum + item.durationMin, 0) / 60 +
          completed * 3,
      ),
    );
    const overdueRate = Number(((overdue / total) * 100).toFixed(1));
    const workloadHealth = users.length
      ? Math.round(
          users.reduce((sum, user) => sum + user.availabilityScore, 0) /
            users.length,
        )
      : 75;

    return {
      productivityIndex: productivity,
      subsystemVelocity: velocity,
      overdueRate,
      clubHealth: Math.min(
        99,
        Math.round((productivity + workloadHealth + (100 - overdueRate)) / 3),
      ),
    };
  }
}
