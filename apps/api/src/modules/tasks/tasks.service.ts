import { Prisma } from "@prisma/client";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { ActorContext } from "../../common/authorization/authorization.types";
import {
  canManageSubsystem,
  canReadSubsystem,
} from "../../common/authorization/authorization.policy";
import { safeUserSelect } from "../../common/prisma/safe-user.select";
import { ForbiddenException, Injectable } from "@nestjs/common";
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

const taskInclude = {
  assignedTo: { select: safeUserSelect },
  assignedBy: { select: safeUserSelect },
  subsystem: true,
  comments: {
    include: { author: { select: safeUserSelect } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskEvents: TaskEventsService,
    private readonly auditService: AuditService,
    private readonly core: CoreAuthorizationService,
  ) {}

  private async redactDependencies<
    T extends {
      dependencyIds: string[];
      subsystemId: string;
      assignedToId: string | null;
    },
  >(task: T, actor: ActorContext, tx: Prisma.TransactionClient = this.prisma) {
    return {
      ...task,
      permissions: {
        canManage: canManageSubsystem(actor, task.subsystemId),
        canUpdateStatus:
          canManageSubsystem(actor, task.subsystemId) ||
          (task.assignedToId === actor.userId &&
            canReadSubsystem(actor, task.subsystemId)),
      },
      dependencyIds: await this.core.visibleTaskIds(
        actor,
        task.dependencyIds,
        tx,
      ),
    };
  }

  async findAll(actorId: string) {
    const actor = await this.core.actor(actorId);
    const tasks = await this.prisma.task.findMany({
      where: {
        ...this.core.taskWhere(actor),
        deletedAt: null,
        isArchived: false,
      },
      include: taskInclude,
      orderBy: [{ deadline: "asc" }, { priority: "desc" }],
      take: 100,
    });
    return Promise.all(
      tasks.map((task) => this.redactDependencies(task, actor)),
    );
  }

  async getActivityFeed(actorId: string) {
    const actor = await this.core.actor(actorId);
    const comments = await this.prisma.taskComment.findMany({
      where: {
        task: {
          ...this.core.taskWhere(actor),
          deletedAt: null,
          isArchived: false,
        },
      },
      take: 12,
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: safeUserSelect },
        task: { select: { title: true } },
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
    const task = await this.core.withActor(
      actorId,
      async (tx, actor) => {
        if (!canManageSubsystem(actor, payload.subsystemId))
          throw new ForbiddenException("Task creation denied");
        if (payload.assignedToId)
          await this.core.assertAssignee(
            tx,
            payload.assignedToId,
            payload.subsystemId,
          );
        const dependencies = [...new Set(payload.dependencyIds ?? [])];
        if (
          (await this.core.visibleTaskIds(actor, dependencies, tx)).length !==
          dependencies.length
        )
          throw new ForbiddenException("Dependency access denied");
        const task = await tx.task.create({
          data: {
            title: payload.title,
            description: payload.description,
            priority: payload.priority,
            status: payload.status ?? TaskStatus.TODO,
            estimatedHours: payload.estimatedHours,
            deadline: new Date(payload.deadline),
            tags: payload.tags ?? [],
            dependencyIds: dependencies,
            subsystemId: payload.subsystemId,
            assignedById: actorId,
            assignedToId: payload.assignedToId,
          },
          include: taskInclude,
        });
        await tx.auditLog.create({
          data: {
            action: "CREATE",
            entityType: "Task",
            entityId: task.id,
            actorId,
            payload: { title: task.title },
          },
        });
        return this.redactDependencies(task, actor, tx);
      },
      payload.assignedToId ? [payload.assignedToId] : [],
    );
    this.taskEvents.emitTaskUpdated({ type: "created", task });
    return task;
  }

  private async mutate(
    taskId: string,
    actorId: string,
    action: "manage" | "status",
    data: Prisma.TaskUncheckedUpdateInput,
    auditAction: string,
    assigneeId?: string | null,
  ) {
    const task = await this.core.withActor(
      actorId,
      async (tx, actor) => {
        await this.core.lockTasks(tx, [taskId]);
        const persisted = await this.core.task(actor, taskId, action, tx);
        if (assigneeId)
          await this.core.assertAssignee(tx, assigneeId, persisted.subsystemId);
        const task = await tx.task.update({
          where: { id: taskId },
          data,
          include: taskInclude,
        });
        await tx.auditLog.create({
          data: {
            action: auditAction,
            entityType: "Task",
            entityId: taskId,
            actorId,
          },
        });
        return this.redactDependencies(task, actor, tx);
      },
      assigneeId ? [assigneeId] : [],
    );
    this.taskEvents.emitTaskUpdated({ type: auditAction, task });
    return task;
  }

  updateStatus(taskId: string, payload: UpdateTaskStatusDto, actorId: string) {
    return this.mutate(
      taskId,
      actorId,
      "status",
      { status: payload.status },
      "STATUS_CHANGE",
    );
  }
  reassign(taskId: string, assignedToId: string | null, actorId: string) {
    return this.mutate(
      taskId,
      actorId,
      "manage",
      { assignedToId },
      "REASSIGN",
      assignedToId,
    );
  }
  async delete(taskId: string, actorId: string) {
    await this.mutate(
      taskId,
      actorId,
      "manage",
      { deletedAt: new Date(), isArchived: true },
      "DELETE",
    );
    return { deleted: true };
  }

  async addComment(
    taskId: string,
    payload: CreateTaskCommentDto,
    actorId: string,
  ) {
    const comment = await this.core.withActor(actorId, async (tx, actor) => {
      await this.core.lockTasks(tx, [taskId]);
      await this.core.task(actor, taskId, "read", tx);
      const comment = await tx.taskComment.create({
        data: { taskId, authorId: actorId, content: payload.content },
        include: {
          author: { select: safeUserSelect },
          task: { select: { id: true, title: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          action: "COMMENT_ADD",
          entityType: "TaskComment",
          entityId: comment.id,
          actorId,
          payload: { taskId },
        },
      });
      return comment;
    });
    this.taskEvents.emitCommentAdded(comment);
    return comment;
  }

  async getDependencyGraph(
    actorId: string,
    subsystemId?: string,
  ): Promise<DependencyGraphResponse> {
    const actor = await this.core.actor(actorId);
    if (subsystemId && !canReadSubsystem(actor, subsystemId))
      throw new ForbiddenException("Subsystem access denied");
    const tasks = await this.prisma.task.findMany({
      where: {
        ...this.core.taskWhere(actor),
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

    const visible = new Set(tasks.map((task) => task.id));
    for (const task of tasks)
      task.dependencyIds = task.dependencyIds.filter((id) => visible.has(id));

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

    const normalizedCriticalPathTasks = tasks.map((task) => ({
      id: task.id,
      dependencyIds: task.dependencyIds,
      estimatedHours: Number(task.estimatedHours ?? 0),
    }));

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
      const result = {
        length: maxDep.length + hours,
        path: [...maxDep.path, nodeId],
      };
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
