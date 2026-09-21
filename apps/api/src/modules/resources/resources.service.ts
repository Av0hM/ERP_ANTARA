import { Injectable } from "@nestjs/common";
import { TaskPriority, TaskStatus } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AiService } from "../ai/ai.service";

interface ResourceAllocationEntry {
  userId: string;
  userName: string;
  userEmail: string;
  avatarUrl: string | null;
  subsystemId: string;
  subsystemName: string;
  subsystemColor: string;
  role: string;
  skills: string[];
  weeklyCapacityHours: number;
  currentWeeklyLoadHours: number;
  availabilityScore: number;
  activeTasks: Array<{
    id: string;
    title: string;
    priority: TaskPriority;
    estimatedHours: number;
    deadline: Date;
    subsystemId: string;
  }>;
}

interface WeeklyAllocation {
  weekStart: Date;
  weekEnd: Date;
  allocations: Array<{
    userId: string;
    subsystemId: string;
    hours: number;
    tasks: string[];
  }>;
}

interface ResourceAllocationBoard {
  users: ResourceAllocationEntry[];
  weeks: WeeklyAllocation[];
  conflicts: Array<{
    type: "overallocation" | "skill_mismatch" | "dependency_conflict";
    severity: "HIGH" | "MEDIUM" | "LOW";
    description: string;
    affectedUsers: string[];
  }>;
  aiSuggestions: Array<{
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    taskId: string;
    taskTitle: string;
    reason: string;
    estimatedHoursSaved: number;
  }>;
}

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) { }

  async getResourceAllocationBoard(horizonWeeks = 4): Promise<ResourceAllocationBoard> {
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + horizonWeeks * 7 * 24 * 60 * 60 * 1000);

    const [users, tasks, subsystems] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true },
        include: {
          subsystem: { select: { id: true, name: true, color: true } },
          assignedTasks: {
            where: {
              deletedAt: null,
              isArchived: false,
              status: { not: TaskStatus.COMPLETED },
              deadline: { lte: horizonEnd },
            },
            include: { subsystem: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.task.findMany({
        where: {
          deletedAt: null,
          isArchived: false,
          status: { not: TaskStatus.COMPLETED },
          deadline: { lte: horizonEnd },
        },
        include: {
          subsystem: { select: { id: true, name: true, color: true } },
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      this.prisma.subsystem.findMany({
        select: { id: true, name: true, color: true },
      }),
    ]);

    const subsystemMap = new Map(subsystems.map((s: { id: string; name: string; color: string }) => [s.id, s]));
    const userMap = new Map(users.map((u: { id: string }) => [u.id, u]));

    // Build user allocation entries
    const userEntries: ResourceAllocationEntry[] = users.map((user) => {
      const activeTasks = user.assignedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        estimatedHours: Number(task.estimatedHours ?? 0),
        deadline: task.deadline,
        subsystemId: task.subsystemId,
      }));

      const currentWeeklyLoadHours = activeTasks.reduce((sum: number, t: { estimatedHours: number }) => sum + t.estimatedHours, 0);

      return {
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        avatarUrl: user.avatarUrl,
        subsystemId: user.subsystemId ?? "",
        subsystemName: user.subsystem?.name ?? "Unassigned",
        subsystemColor: user.subsystem?.color ?? "#64748b",
        role: user.role,
        skills: user.skills,
        weeklyCapacityHours: user.weeklyCapacityHours,
        currentWeeklyLoadHours,
        availabilityScore: user.availabilityScore,
        activeTasks,
      };
    });

    // Build weekly allocations
    const weeks: WeeklyAllocation[] = [];
    for (let w = 0; w < horizonWeeks; w++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + w * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekTasks = tasks.filter(
        (t: { deadline: Date }) => t.deadline >= weekStart && t.deadline <= weekEnd,
      );

      const allocations: WeeklyAllocation["allocations"] = [];
      for (const task of weekTasks) {
        if (task.assignedToId) {
          const existing = allocations.find((a) => a.userId === task.assignedToId && a.subsystemId === task.subsystemId);
          if (existing) {
            existing.hours += Number(task.estimatedHours ?? 0);
            existing.tasks.push(task.id);
          } else {
            allocations.push({
              userId: task.assignedToId!,
              subsystemId: task.subsystemId,
              hours: Number(task.estimatedHours ?? 0),
              tasks: [task.id],
            });
          }
        }
      }

      weeks.push({ weekStart, weekEnd, allocations });
    }

    // Detect conflicts
    const conflicts = this.detectConflicts(userEntries, weeks);

    // Get AI suggestions
    let aiSuggestions: ResourceAllocationBoard["aiSuggestions"] = [];
    try {
      const workloadSuggestions = await this.aiService.getWorkloadSuggestions();
      aiSuggestions = workloadSuggestions.map((s: { from: string; to: string; reason: string }) => ({
        fromUserId: "",
        fromUserName: s.from,
        toUserId: "",
        toUserName: s.to,
        taskId: "",
        taskTitle: "",
        reason: s.reason,
        estimatedHoursSaved: 0,
      }));
    } catch {
      // Ignore AI errors
    }

    return {
      users: userEntries,
      weeks,
      conflicts,
      aiSuggestions,
    };
  }

  private detectConflicts(
    users: ResourceAllocationEntry[],
    weeks: WeeklyAllocation[],
  ): ResourceAllocationBoard["conflicts"] {
    const conflicts: ResourceAllocationBoard["conflicts"] = [];

    // Overallocation conflicts
    for (const user of users) {
      if (user.currentWeeklyLoadHours > user.weeklyCapacityHours * 1.2) {
        conflicts.push({
          type: "overallocation",
          severity: user.currentWeeklyLoadHours > user.weeklyCapacityHours * 1.5 ? "HIGH" : "MEDIUM",
          description: `${user.userName} is allocated ${user.currentWeeklyLoadHours}h against ${user.weeklyCapacityHours}h capacity (${Math.round((user.currentWeeklyLoadHours / user.weeklyCapacityHours) * 100)}%)`,
          affectedUsers: [user.userId],
        });
      }
    }

    // Weekly overallocation
    for (const week of weeks) {
      const userLoads = new Map<string, number>();
      for (const alloc of week.allocations) {
        userLoads.set(alloc.userId, (userLoads.get(alloc.userId) ?? 0) + alloc.hours);
      }
      for (const [userId, hours] of userLoads.entries()) {
        const user = users.find((u) => u.userId === userId);
        if (user && hours > user.weeklyCapacityHours) {
          conflicts.push({
            type: "overallocation",
            severity: hours > user.weeklyCapacityHours * 1.5 ? "HIGH" : "MEDIUM",
            description: `Week ${week.weekStart.toLocaleDateString()} - ${user.userName} overloaded with ${hours}h (capacity: ${user.weeklyCapacityHours}h)`,
            affectedUsers: [userId],
          });
        }
      }
    }

    // Skill mismatch (tasks assigned to users without relevant skills)
    // This would need task skill requirements - simplified for now

    return conflicts;
  }

  async getSuggestedMoves(): Promise<Array<{
    taskId: string;
    taskTitle: string;
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    reason: string;
  }>> {
    const board = await this.getResourceAllocationBoard();
    return board.aiSuggestions.map((s) => ({
      taskId: s.taskId,
      taskTitle: s.taskTitle,
      fromUserId: s.fromUserId,
      fromUserName: s.fromUserName,
      toUserId: s.toUserId,
      toUserName: s.toUserName,
      reason: s.reason,
    }));
  }

  async applyMove(taskId: string, newAssigneeId: string, actorId: string) {
    return this.prisma.task.update({
      where: { id: taskId },
      data: { assignedToId: newAssigneeId },
      include: { subsystem: true, assignedTo: true },
    });
  }
}