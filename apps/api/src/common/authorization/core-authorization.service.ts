import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { lockAccounts } from "../sessions/session.service";
import { AuthorizationService } from "./authorization.service";
import { ActorContext } from "./authorization.types";
import {
  canManageSubsystem,
  canReadSubsystem,
  isActiveActor,
  readableSubsystemIds,
} from "./authorization.policy";

/** Phase 4A integration helpers; the Phase 1B policy remains authoritative. */
@Injectable()
export class CoreAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationService,
  ) {}

  async actor(userId: string, tx?: Prisma.TransactionClient) {
    const actor = await this.authorization.loadActorContext(userId, tx);
    if (!isActiveActor(actor))
      throw new UnauthorizedException("Account is unavailable");
    return actor;
  }

  taskWhere(actor: ActorContext): Prisma.TaskWhereInput {
    const scope = readableSubsystemIds(actor);
    return scope.kind === "GLOBAL"
      ? {}
      : { subsystemId: { in: [...scope.ids] } };
  }

  decisionWhere(actor: ActorContext): Prisma.DecisionRecordWhereInput {
    const scope = readableSubsystemIds(actor);
    return {
      OR: [
        { scope: "GLOBAL", authority: "OWNER", subsystemId: null },
        {
          scope: "SUBSYSTEM",
          authority: { in: ["OWNER", "SUBSYSTEM_ADMIN"] },
          subsystemId:
            scope.kind === "GLOBAL" ? { not: null } : { in: [...scope.ids] },
        },
      ],
    };
  }

  /** Lock actor before objects. Membership writers lock the same User row. */
  withActor<T>(
    userId: string,
    operation: (
      tx: Prisma.TransactionClient,
      actor: ActorContext,
    ) => Promise<T>,
    relatedUserIds: string[] = [],
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await lockAccounts(tx, [userId, ...relatedUserIds]);
        const actor = await this.actor(userId, tx);
        return operation(tx, actor);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async task(
    actor: ActorContext,
    id: string,
    action: "read" | "manage" | "status",
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const task = await tx.task.findUnique({
      where: { id },
      select: {
        id: true,
        subsystemId: true,
        assignedToId: true,
        deletedAt: true,
        isArchived: true,
      },
    });
    if (!task || task.deletedAt || task.isArchived)
      throw new NotFoundException("Task not found");
    const allowed =
      action === "read"
        ? canReadSubsystem(actor, task.subsystemId)
        : canManageSubsystem(actor, task.subsystemId) ||
          (action === "status" &&
            task.assignedToId === actor.userId &&
            canReadSubsystem(actor, task.subsystemId));
    if (!allowed) throw new ForbiddenException("Task access denied");
    return task;
  }

  async lockTasks(tx: Prisma.TransactionClient, ids: string[]) {
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${id} FOR UPDATE`;
  }
  async lockDecisions(tx: Prisma.TransactionClient, ids: string[]) {
    for (const id of [...new Set(ids)].sort())
      await tx.$queryRaw`SELECT id FROM "DecisionRecord" WHERE id = ${id} FOR UPDATE`;
  }

  async canReceiveTaskEvent(actor: ActorContext, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { subsystemId: true },
    });
    return !!task && canReadSubsystem(actor, task.subsystemId);
  }

  async visibleTaskIds(
    actor: ActorContext,
    ids: string[],
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    if (!ids.length) return [];
    const tasks = await tx.task.findMany({
      where: {
        AND: [
          this.taskWhere(actor),
          { id: { in: ids }, deletedAt: null, isArchived: false },
        ],
      },
      select: { id: true },
    });
    return tasks.map((task) => task.id);
  }
}
