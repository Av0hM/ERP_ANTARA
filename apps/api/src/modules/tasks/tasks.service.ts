import { Injectable } from "@nestjs/common";
import { TaskStatus } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateTaskCommentDto } from "./dto/create-task-comment.dto";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { TaskEventsService } from "./events/task-events.service";
import { AuditService } from "../audit/audit.service";

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

    return comments.map((comment: { id: string; content: string; createdAt: Date; author: { name: string }; task: { title: string } }) => ({
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
}

