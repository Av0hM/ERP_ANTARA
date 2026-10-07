import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { Prisma } from "@prisma/client";
import { safeUserSelect } from "../../common/prisma/safe-user.select";
import { Injectable, NotFoundException } from "@nestjs/common";
import { WorklogSource } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateWorklogDto } from "./dto/create-worklog.dto";
import { StartWorklogSessionDto } from "./dto/start-worklog-session.dto";
import { StopWorklogSessionDto } from "./dto/stop-worklog-session.dto";

@Injectable()
export class WorklogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: CoreAuthorizationService,
  ) {}

  async list(actorId: string) {
    const actor = await this.core.actor(actorId);
    const logs = await this.prisma.workLog.findMany({
      where: actor.globalAuthority ? {} : { userId: actorId },
      include: {
        task: { select: { id: true, title: true } },
        user: { select: safeUserSelect },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    const visible = new Set(
      await this.core.visibleTaskIds(
        actor,
        logs.flatMap((log) => (log.taskId ? [log.taskId] : [])),
      ),
    );
    return logs.map((log) => ({
      ...log,
      taskId: log.taskId && visible.has(log.taskId) ? log.taskId : null,
      task: log.taskId && visible.has(log.taskId) ? log.task : null,
    }));
  }

  async summary(actorId: string) {
    const actor = await this.core.actor(actorId);
    const worklogs = await this.prisma.workLog.findMany({
      where: actor.globalAuthority ? {} : { userId: actorId },
      select: {
        durationMin: true,
      },
    });
    const totalMinutes = worklogs.reduce(
      (sum: number, log: { durationMin: number }) => sum + log.durationMin,
      0,
    );
    return {
      totalMinutes,
      totalSessions: worklogs.length,
      avgSessionMinutes: worklogs.length
        ? Math.round(totalMinutes / worklogs.length)
        : 0,
    };
  }

  async create(payload: CreateWorklogDto, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      if (payload.taskId) {
        await this.core.lockTasks(tx, [payload.taskId]);
        await this.core.task(actor, payload.taskId, "read", tx);
      }
      return tx.workLog.create({
        data: {
          userId: actorId,
          taskId: payload.taskId,
          startedAt: new Date(payload.startedAt),
          endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
          durationMin: payload.durationMin,
          notes: payload.notes,
          source: WorklogSource.MANUAL,
        },
      });
    });
  }

  async startSession(payload: StartWorklogSessionDto, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      if (payload.taskId) {
        await this.core.lockTasks(tx, [payload.taskId]);
        await this.core.task(actor, payload.taskId, "read", tx);
      }
      return tx.workLog.create({
        data: {
          userId: actorId,
          taskId: payload.taskId,
          startedAt: new Date(),
          durationMin: 1,
          notes: payload.notes,
          source: WorklogSource.TIMER,
        },
      });
    });
  }

  async stopSession(
    id: string,
    payload: StopWorklogSessionDto,
    actorId: string,
  ) {
    try {
      return await this.core.withActor(actorId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM "WorkLog" WHERE id = ${id} FOR UPDATE`;
        const log = await tx.workLog.update({
          where: { id, userId: actorId },
          data: {
            endedAt: new Date(payload.endedAt),
            durationMin: payload.durationMin,
            notes: payload.notes,
          },
        });
        // Personal session may be stopped even after its task membership is removed;
        // do not return stale task references or notes through the mutation response.
        return {
          id: log.id,
          userId: log.userId,
          startedAt: log.startedAt,
          endedAt: log.endedAt,
          durationMin: log.durationMin,
          source: log.source,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new NotFoundException({
          code: "WORKLOG_NOT_FOUND",
          message: "Worklog not found for this account",
        });
      }
      throw error;
    }
  }
}
