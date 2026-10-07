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
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return await this.prisma.workLog.findMany({
      include: {
        task: true,
        user: { select: safeUserSelect },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  async summary() {
    const worklogs = await this.prisma.workLog.findMany({
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
    return await this.prisma.workLog.create({
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
  }

  async startSession(payload: StartWorklogSessionDto, actorId: string) {
    return await this.prisma.workLog.create({
      data: {
        userId: actorId,
        taskId: payload.taskId,
        startedAt: new Date(),
        durationMin: 1,
        notes: payload.notes,
        source: WorklogSource.TIMER,
      },
    });
  }

  async stopSession(
    id: string,
    payload: StopWorklogSessionDto,
    actorId: string,
  ) {
    try {
      return await this.prisma.workLog.update({
        where: { id, userId: actorId },
        data: {
          endedAt: new Date(payload.endedAt),
          durationMin: payload.durationMin,
          notes: payload.notes,
        },
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
