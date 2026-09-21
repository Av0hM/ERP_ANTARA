import { Injectable } from "@nestjs/common";
import { TaskPriority, TaskStatus } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { TaskEventsService } from "./events/task-events.service";
import { AuditService } from "../audit/audit.service";

interface DependencyGraphNode {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  subsystem: string;
  assignee: { id: string; name: string } | null;
  isCriticalPath: boolean;
}

interface DependencyGraphEdge {
  from: string;
  to: string;
  type: "blocks" | "relates";
}

interface DependencyGraphResponse {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
  criticalPath: string[];
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskEvents: TaskEventsService,
    private readonly auditService: AuditService,
  ) {}

  findAll() {
    return this.prisma.task.findMany({
      where: {
        deletedAt: null,
        isArchived: false,
      },
      include: {
        assignedTo: true,
        assignedBy: true,
        subsystem: true,
        comments: {
          include: {
            author: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ deadline: "asc" }, { priority: "desc" }],
      take: 100,
    });
  }

  async getActivityFeed() {
    const comments = await this.prisma.taskComment.findMany({
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        author: true,
        task: true,
      },
    });

    return comments.map((comment) => ({
      id: comment.id,
      type: "comment",
      title: `${comment.author.name} commented on ${comment.task.title}`,
      description: comment.content,
      timestamp: comment.createdAt.toISOString(),
    }));
  }

  async create(payload: CreateTaskDto, actorId: string) {
    const data = {
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      status: payload.status ?? TaskStatus.TODO,
      estimatedHours: payload.estimatedHours,
      deadline: new Date(payload.deadline),
      tags: payload.tags ?? [],
      dependencyIds: payload.dependencyIds ?? [],
      subsystemId: payload.subsystemId,
      assignedById: payload.assignedById,
      assignedToId: payload.assignedToId,
    };

    const task = await this.prisma.task.create({
      data,
      include: {
        assignedTo: true,
        subsystem: true,
      },
    });

    this.taskEvents.emitTaskUpdated({
      type: "created",
      task,
    });

    await this.auditService.log({
      action: "CREATE",
      entityType: "Task",
      entityId: task.id,
      actorId,
      payload: { title: task.title, status: task.status },
    });

    return task;
  }

  async updateStatus(taskId: string, payload: UpdateTaskStatusDto, actorId: string) {
    const oldTask = await this.prisma.task.findUnique({ where: { id: taskId } });

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        status: payload.status,
      },
      include: {
        assignedTo: true,
        subsystem: true,
      },
    });

    this.taskEvents.emitTaskUpdated({
      type: "status_changed",
      task,
    });

    await this.auditService.log({
      action: "STATUS_CHANGE",
      entityType: "Task",
      entityId: taskId,
      actorId,
      payload: { oldStatus: oldTask?.status, newStatus: task.status },
    });

    return task;
  }

  async reassign(taskId: string, assignedToId: string | null, actorId: string) {
    const oldTask = await this.prisma.task.findUnique({ where: { id: taskId } });

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        assignedToId,
      },
      include: {
        assignedTo: true,
        assignedBy: true,
        subsystem: true,
        comments: {
          include: {
            author: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    this.taskEvents.emitTaskUpdated({
      type: "reassigned",
      task,
    });

    await this.auditService.log({
      action: "REASSIGN",
      entityType: "Task",
      entityId: taskId,
      actorId,
      payload: { oldAssigneeId: oldTask?.assignedToId, newAssigneeId: assignedToId },
    });

    return task;
  }

  async addComment(taskId: string, payload: CreateTaskCommentDto, actorId: string) {
    const comment = await this.prisma.taskComment.create({
      data: {
        taskId,
        authorId: payload.authorId,
        content: payload.content,
      },
      include: {
        author: true,
        task: true,
      },
    });

    this.taskEvents.emitCommentAdded(comment);

    await this.auditService.log({
      action: "COMMENT_ADD",
      entityType: "TaskComment",
      entityId: comment.id,
      actorId,
      payload: { taskId, content: payload.content },
    });

    return comment;
  }

  async delete(taskId: string, actorId: string) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      return { deleted: false };
    }

    await this.prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date(), isArchived: true },
    });

    await this.auditService.log({
      action: "DELETE",
      entityType: "Task",
      entityId: taskId,
      actorId,
      payload: { title: task.title },
    });

    return { deleted: true };
  }

  async getDependencyGraph(subsystemId?: string): Promise<DependencyGraphResponse> {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
        isArchived: false,
        ...(subsystemId && { subsystemId }),
      },
      include: {
        subsystem: { select: { name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: [{ deadline: "asc" }, { priority: "desc" }],
    });

    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const adj = new Map<string, string[]>();
    const reverseAdj = new Map<string, string[]>();

    tasks.forEach((task) => {
      adj.set(task.id, task.dependencyIds ?? []);
      task.dependencyIds?.forEach((depId) => {
        const rev = reverseAdj.get(depId) ?? [];
        rev.push(task.id);
        reverseAdj.set(depId, rev);
      });
    });

    const hasCycle = (): boolean => {
      const visited = new Set<string>();
      const recStack = new Set<string>();

      const dfs = (node: string): boolean => {
        visited.add(node);
        recStack.add(node);
        const neighbors = adj.get(node) ?? [];
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (dfs(neighbor)) return true;
          } else if (recStack.has(neighbor)) {
            return true;
          }
        }
        recStack.delete(node);
        return false;
      };

      for (const task of tasks) {
        if (!visited.has(task.id)) {
          if (dfs(task.id)) return true;
        }
      }
      return false;
    };

    if (hasCycle()) {
      console.warn("Dependency cycle detected in task graph");
    }

    const normalizedCriticalPathTasks = tasks.map(
      (task) => ({
        id: task.id,
        dependencyIds: task.dependencyIds,
        estimatedHours: Number(task.estimatedHours ?? 0),
      }),
    );

    const criticalPath = this.computeCriticalPath(
      normalizedCriticalPathTasks,
      adj,
    );

    const criticalPathSet = new Set(criticalPath);

    const nodes: DependencyGraphNode[] = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status as TaskStatus,
      priority: task.priority as TaskPriority,
      subsystem: task.subsystem?.name ?? null,
      assignee: task.assignedTo
        ? {
            id: task.assignedTo.id,
            name: task.assignedTo.name,
          }
        : null,
      isCriticalPath: criticalPathSet.has(task.id),
    }));

    const edges: DependencyGraphEdge[] = [];
    tasks.forEach((task) => {
      (task.dependencyIds ?? []).forEach((depId: string) => {
        if (taskMap.has(depId)) {
          edges.push({ from: depId, to: task.id, type: "blocks" });
        }
      });
    });

    return { nodes, edges, criticalPath };
  }

  private computeCriticalPath(
    tasks: Array<{
      id: string;
      estimatedHours: number;
      dependencyIds: string[];
    }>,
    adj: Map<string, string[]>,
  ): string[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const memo = new Map<string, { length: number; path: string[] }>();

    const dfs = (nodeId: string): { length: number; path: string[] } => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;

      const task = taskMap.get(nodeId);
      if (!task) return { length: 0, path: [] };

      const deps = adj.get(nodeId) ?? [];
      if (deps.length === 0) {
        const hours = Number(task.estimatedHours ?? 0);
        const result = { length: hours, path: [nodeId] };
        memo.set(nodeId, result);
        return result;
      }

      let maxDep = { length: 0, path: [] as string[] };
      for (const depId of deps) {
        const depResult = dfs(depId);
        if (depResult.length > maxDep.length) {
          maxDep = depResult;
        }
      }

      const hours = Number(task.estimatedHours ?? 0);
      const result = { length: maxDep.length + hours, path: [...maxDep.path, nodeId] };
      memo.set(nodeId, result);
      return result;
    };

    let longest = { length: 0, path: [] as string[] };
    for (const task of tasks) {
      const result = dfs(task.id);
      if (result.length > longest.length) {
        longest = result;
      }
    }

    return longest.path;
  }
}

