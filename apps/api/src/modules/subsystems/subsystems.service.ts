import { Injectable } from "@nestjs/common";
import { TaskPriority, TaskStatus } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";

interface SubsystemHealthMetrics {
  velocity: number;
  riskScore: number;
  completionRate: number;
  activeTaskCount: number;
  overdueCount: number;
  blockedCount: number;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    deadline: string;
    priority: TaskPriority;
  }>;
}

interface BlockingRelation {
  taskId: string;
  title: string;
  fromSubsystem: string;
  blockingTask: string;
  toSubsystem: string;
  dependentTask: string;
}

interface WorkloadEntry {
  memberId: string;
  name: string;
  activeTasks: number;
  availabilityScore: number;
}

interface RecentActivityEntry {
  type: "task" | "comment" | "worklog";
  timestamp: string;
  summary: string;
}

interface SubsystemHealthResponse {
  subsystem: {
    id: string;
    name: string;
    slug: string;
    color: string;
    memberCount: number;
  };
  metrics: SubsystemHealthMetrics;
  incomingBlockers: BlockingRelation[];
  outgoingBlockers: BlockingRelation[];
  workload: WorkloadEntry[];
  recentActivity: RecentActivityEntry[];
}

@Injectable()
export class SubsystemsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const subsystems = (await this.prisma.subsystem.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            users: true,
            tasks: true,
            events: true,
            insights: true,
          },
        },
      },
    })) as Array<{
      id: string;
      name: string;
      slug: string;
      description: string;
      color: string;
      _count: { users: number; tasks: number; events: number; insights: number };
    }>;

    return subsystems.map((subsystem) => ({
      id: subsystem.id,
      name: subsystem.name,
      slug: subsystem.slug,
      description: subsystem.description,
      color: subsystem.color,
      taskCount: subsystem._count.tasks,
      memberCount: subsystem._count.users,
      eventCount: subsystem._count.events,
      insightCount: subsystem._count.insights,
    }));
  }

  async getHealth(slug: string): Promise<SubsystemHealthResponse> {
    const subsystem = await this.prisma.subsystem.findUnique({
      where: { slug },
      include: {
        users: { select: { id: true, name: true, availabilityScore: true } },
      },
    });

    if (!subsystem) {
      throw new Error(`Subsystem not found: ${slug}`);
    }

    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [tasks, allTasks, worklogs, comments] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          subsystemId: subsystem.id,
          deletedAt: null,
          isArchived: false,
        },
        include: {
          assignedTo: { select: { id: true, name: true, availabilityScore: true } },
          subsystem: { select: { name: true, slug: true } },
        },
        orderBy: [{ deadline: "asc" }, { priority: "desc" }],
      }),
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          isArchived: false,
        },
        include: {
          subsystem: { select: { name: true, slug: true } },
        },
      }),
      this.prisma.workLog.findMany({
        where: {
          task: { subsystemId: subsystem.id },
          startedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
        },
        include: {
          user: { select: { name: true } },
          task: { select: { title: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
      this.prisma.taskComment.findMany({
        where: {
          task: { subsystemId: subsystem.id },
        },
        include: {
          author: { select: { name: true } },
          task: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    const activeTasks = tasks.filter((t: { status: TaskStatus; deadline: Date; assignedToId: string | null }) => t.status !== TaskStatus.COMPLETED);
    const completedTasks = tasks.filter((t: { status: TaskStatus }) => t.status === TaskStatus.COMPLETED);
    const overdueTasks = activeTasks.filter((t: { deadline: Date }) => t.deadline < now);
    const blockedTasks = activeTasks.filter((t: { status: TaskStatus }) => t.status === TaskStatus.BLOCKED);
    const upcomingTasks = activeTasks
      .filter((t: { deadline: Date }) => t.deadline >= now && t.deadline <= soon)
      .sort((a: { deadline: Date }, b: { deadline: Date }) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 10);

    const completionRate = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
    const overdueCount = overdueTasks.length;
    const blockedCount = blockedTasks.length;
    const activeTaskCount = activeTasks.length;

    const velocity = Math.min(99, Math.round(55 + completedTasks.length * 6 + activeTaskCount * 2));
    const totalHours = tasks.reduce((sum: number, t: { estimatedHours: number | string }) => sum + Number(t.estimatedHours ?? 0), 0);
    const riskScore = Math.min(99, Math.round(20 + overdueCount * 12 + blockedCount * 10 + activeTaskCount * 3 + totalHours / 2));

    const incomingBlockers: BlockingRelation[] = [];
    const outgoingBlockers: BlockingRelation[] = [];

    for (const task of tasks) {
      for (const depId of task.dependencyIds ?? []) {
        const depTask = allTasks.find((t: { id: string; subsystemId: string; subsystem: { name: string } | null; title: string }) => t.id === depId);
        if (depTask && depTask.subsystemId !== subsystem.id) {
          incomingBlockers.push({
            taskId: task.id,
            title: task.title,
            fromSubsystem: depTask.subsystem?.name ?? "Unknown",
            blockingTask: depTask.title,
            toSubsystem: subsystem.name,
            dependentTask: task.title,
          });
        }
      }
    }

    for (const task of allTasks) {
      if (task.subsystemId !== subsystem.id) {
        for (const depId of task.dependencyIds ?? []) {
          if (depId === task.id) continue;
          const depTask = allTasks.find((t: { id: string; subsystemId: string; subsystem: { name: string } | null; title: string }) => t.id === depId);
          if (depTask && depTask.subsystemId === subsystem.id) {
            outgoingBlockers.push({
              taskId: task.id,
              title: task.title,
              fromSubsystem: subsystem.name,
              blockingTask: depTask.title,
              toSubsystem: task.subsystem?.name ?? "Unknown",
              dependentTask: task.title,
            });
          }
        }
      }
    }

    const workload: WorkloadEntry[] = subsystem.users.map((user: { id: string; name: string; availabilityScore: number }) => {
      const userActiveTasks = activeTasks.filter((t: { assignedToId: string | null }) => t.assignedToId === user.id).length;
      return {
        memberId: user.id,
        name: user.name,
        activeTasks: userActiveTasks,
        availabilityScore: user.availabilityScore,
      };
    });

    const recentActivity: RecentActivityEntry[] = [
      ...worklogs.map((w: { user: { name: string } | null; durationMin: number; task: { title: string } | null; startedAt: Date }) => ({
        type: "worklog" as const,
        timestamp: w.startedAt.toISOString(),
        summary: `${w.user?.name ?? "Member"} logged ${Math.round(w.durationMin / 60)}h on "${w.task?.title ?? "task"}"`,
      })),
      ...comments.map((c: { author: { name: string } | null; task: { title: string } | null; createdAt: Date }) => ({
        type: "comment" as const,
        timestamp: c.createdAt.toISOString(),
        summary: `${c.author?.name ?? "Member"} commented on "${c.task?.title ?? "task"}"`,
      })),
    ].sort((a: { timestamp: string }, b: { timestamp: string }) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);

    return {
      subsystem: {
        id: subsystem.id,
        name: subsystem.name,
        slug: subsystem.slug,
        color: subsystem.color,
        memberCount: subsystem.users.length,
      },
      metrics: {
        velocity,
        riskScore,
        completionRate,
        activeTaskCount,
        overdueCount,
        blockedCount,
        upcomingDeadlines: upcomingTasks.map((t: { id: string; title: string; deadline: Date; priority: TaskPriority }) => ({
          id: t.id,
          title: t.title,
          deadline: t.deadline.toISOString(),
          priority: t.priority,
        })),
      },
      incomingBlockers,
      outgoingBlockers,
      workload,
      recentActivity,
    };
  }
}

