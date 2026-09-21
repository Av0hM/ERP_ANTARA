import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { subsystemCatalog, TaskStatus } from "@antara/contracts";

import { RedisCacheService } from "../../common/cache/redis-cache.service";
import { PrismaService } from "../../common/prisma/prisma.service";

type AnalyticsOverview = {
  productivityIndex: number;
  subsystemVelocity: number;
  overdueRate: number;
  clubHealth: number;
};

type HeatmapCell = { day: string; intensity: number };
type VelocityPoint = { label: string; value: number };
type SubsystemBreakdown = { name: string; velocity: number; risk: number; completion: number };

@Injectable()
export class AnalyticsService implements OnModuleInit, OnModuleDestroy {
  private readonly refreshIntervalMs = 15 * 60 * 1000;
  private snapshotTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  async onModuleInit() {
    await this.refreshAnalyticsSnapshot();
    this.snapshotTimer = setInterval(() => {
      void this.refreshAnalyticsSnapshot();
    }, this.refreshIntervalMs);
    this.snapshotTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
    }
  }

  async getOwnerOverview(): Promise<AnalyticsOverview> {
    const cacheKey = "analytics:overview";
    const cached = await this.cache.getJson<AnalyticsOverview>(cacheKey);
    if (cached) {
      return cached;
    }

    const overview = await this.computeOverview();
    await this.cache.setJson(cacheKey, overview, 300);
    return overview;
  }

  async getVelocityTrend(): Promise<VelocityPoint[]> {
    const cacheKey = "analytics:velocity";
    const cached = await this.cache.getJson<VelocityPoint[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const snapshots = await this.prisma.analyticsSnapshot.findMany({
      take: 8,
      orderBy: { periodStart: "asc" },
    });

    const series =
      snapshots.length > 0
        ? snapshots.map((snapshot, index) => ({
            label: `P${index + 1}`,
            value: Number(snapshot.velocityScore),
          }))
        : [];

    await this.cache.setJson(cacheKey, series, 300);
    return series;
  }

  async getHeatmap(): Promise<HeatmapCell[]> {
    const cacheKey = "analytics:heatmap";
    const cached = await this.cache.getJson<HeatmapCell[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const worklogs = await this.prisma.workLog.findMany({
      where: {
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
      tally[index]!.intensity += Math.max(1, Math.round(worklog.durationMin / 60));
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

  async getSubsystemBreakdown(): Promise<SubsystemBreakdown[]> {
    const cacheKey = "analytics:subsystems";
    const cached = await this.cache.getJson<SubsystemBreakdown[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        isArchived: false,
      },
      include: {
        subsystem: { select: { name: true } },
      },
    });

    const subsystems = subsystemCatalog.map((name) => {
      const relevant = tasks.filter((task) => task.subsystem.name === name);
      const completed = relevant.filter((task) => task.status === TaskStatus.COMPLETED).length;
      const overdue = relevant.filter((task) => task.status === TaskStatus.OVERDUE || task.deadline < new Date()).length;
      const active = relevant.filter((task) => task.status !== TaskStatus.COMPLETED).length;
      const totalHours = relevant.reduce((sum, task) => sum + Number(task.estimatedHours ?? 0), 0);
      return {
        name,
        velocity: Math.min(99, Math.round(55 + completed * 6 + active * 2)),
        risk: Math.min(99, Math.round(20 + overdue * 12 + active * 3 + totalHours / 2)),
        completion: relevant.length ? Math.round((completed / relevant.length) * 100) : 0,
      };
    });

    const result = subsystems;
    await this.cache.setJson(cacheKey, result, 300);
    return result;
  }

  async getBundle() {
    const [overview, velocity, heatmap, subsystems] = await Promise.all([
      this.getOwnerOverview(),
      this.getVelocityTrend(),
      this.getHeatmap(),
      this.getSubsystemBreakdown(),
    ]);

    return { overview, velocity, heatmap, subsystems };
  }

  async refreshAnalyticsSnapshot() {
    const [overview, velocity, heatmap, subsystems] = await Promise.all([
      this.computeOverview(),
      this.getVelocityTrend(),
      this.getHeatmap(),
      this.getSubsystemBreakdown(),
    ]);

    const now = new Date();
    const periodEnd = new Date(now);
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const existing = await this.prisma.analyticsSnapshot.findFirst({
      where: {
        scope: "GLOBAL",
        periodStart: {
          gte: periodStart,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!existing) {
      await this.prisma.analyticsSnapshot.create({
        data: {
          scope: "GLOBAL",
          periodStart,
          periodEnd,
          tasksCompleted: Math.round(overview.productivityIndex),
          avgCompletionHours: 12,
          overduePercentage: overview.overdueRate,
          velocityScore: overview.subsystemVelocity,
          payload: { overview, velocity, heatmap, subsystems },
        },
      });
    }
  }

  private async computeOverview(): Promise<AnalyticsOverview> {
    const [tasks, worklogs, users] = await Promise.all([
      this.prisma.task.findMany({
        where: {
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
          isActive: true,
        },
        select: {
          availabilityScore: true,
        },
      }),
    ]);

    const total = tasks.length || 1;
    const completed = tasks.filter((task) => task.status === TaskStatus.COMPLETED).length;
    const overdue = tasks.filter((task) => task.status === TaskStatus.OVERDUE || task.deadline < new Date()).length;
    const active = tasks.filter((task) => task.status !== TaskStatus.COMPLETED).length;
    const velocity = Math.min(99, Math.round((completed / total) * 100 + active * 1.5));
    const productivity = Math.min(99, Math.round(60 + worklogs.reduce((sum, item) => sum + item.durationMin, 0) / 60 + completed * 3));
    const overdueRate = Number(((overdue / total) * 100).toFixed(1));
    const workloadHealth = users.length
      ? Math.round(users.reduce((sum, user) => sum + user.availabilityScore, 0) / users.length)
      : 75;

    return {
      productivityIndex: productivity,
      subsystemVelocity: velocity,
      overdueRate,
      clubHealth: Math.min(99, Math.round((productivity + workloadHealth + (100 - overdueRate)) / 3)),
    };
  }

}

