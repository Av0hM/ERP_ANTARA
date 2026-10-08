import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AIJob, Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { AiConfig } from "../../common/ai/ai.config";
import {
  AiFailure,
  AiProvider,
  parseOutput,
} from "../../common/ai/ai.provider";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { ActorContext } from "../../common/authorization/authorization.types";
import { canManageSubsystem } from "../../common/authorization/authorization.policy";
import { PrismaService } from "../../common/prisma/prisma.service";
import { lockAccounts } from "../../common/sessions/session.service";
import { AiQueueService } from "./ai-queue.service";

export type SubmitAiJob = {
  operation: "SUMMARY" | "INSIGHTS";
  text?: string;
  context?: string;
  subsystemId?: string;
};
const sourceSelect = {
  id: true,
  subsystemId: true,
  title: true,
  status: true,
  priority: true,
  deadline: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;
const version = (row: unknown) =>
  createHash("sha256").update(JSON.stringify(row)).digest("hex");

@Injectable()
export class AiJobsService {
  private readonly logger = new Logger(AiJobsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly core: CoreAuthorizationService,
    private readonly config: AiConfig,
    private readonly provider: AiProvider,
    private readonly queue: AiQueueService,
  ) {}

  async health(actorId: string) {
    await this.core.actor(actorId);
    return { status: await this.provider.readiness() };
  }

  async submit(actorId: string, input: SubmitAiJob) {
    if (!this.config.enabled)
      throw new ServiceUnavailableException({
        code: "AI_DISABLED",
        message: "AI is disabled",
      });
    if (!["SUMMARY", "INSIGHTS"].includes(input.operation))
      throw new BadRequestException("Unsupported AI operation");
    if (
      input.operation === "SUMMARY" &&
      (!input.text?.trim() ||
        input.text.length > 12000 ||
        (input.context?.length ?? 0) > 500 ||
        input.subsystemId)
    )
      throw new BadRequestException("Invalid summary input");
    const job = await this.core.withActor(actorId, async (tx, actor) => {
      if (
        (await tx.aIJob.count({
          where: { actorId, status: { in: ["QUEUED", "RUNNING"] } },
        })) >= 3
      )
        throw new ConflictException("Three AI jobs are already pending");
      const scope =
        input.operation === "SUMMARY"
          ? { kind: "PERSONAL", ids: [] as string[] }
          : this.core.managementScope(actor, input.subsystemId);
      if (scope.kind === "SCOPED" && !scope.ids.length)
        throw new ForbiddenException("No administrative scope");
      const ids = "ids" in scope ? [...scope.ids].sort() : [];
      // Query only after policy evaluation; never send global rows to a scoped model prompt.
      const sources =
        input.operation === "SUMMARY"
          ? []
          : await tx.task.findMany({
              where: {
                ...(scope.kind === "GLOBAL"
                  ? {}
                  : { subsystemId: { in: ids } }),
                deletedAt: null,
                isArchived: false,
              },
              select: sourceSelect,
              orderBy: { id: "asc" },
              take: 50,
            });
      const result = await tx.aIJob.create({
        data: {
          actorId,
          operation: input.operation,
          scopeKind: scope.kind === "SCOPED" ? "SUBSYSTEMS" : scope.kind,
          subsystemIds: ids,
          sourceRefs: sources.map((row) => ({
            id: row.id,
            version: version(row),
          })),
          input:
            input.operation === "SUMMARY"
              ? { text: input.text!, context: input.context ?? "" }
              : {},
          model: this.config.model,
          templateVersion: "antara-advisory-v1",
          maxAttempts: this.config.maxAttempts,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "AI_JOB_SUBMITTED",
          entityType: "AIJob",
          entityId: result.id,
          payload: { operation: result.operation },
        },
      });
      return result;
    });
    try {
      await this.queue.enqueue(job.id);
    } catch {
      // A late Redis acknowledgement cannot publish a failed submission: workers claim only QUEUED rows.
      await this.prisma.$transaction(async (tx) => {
        await lockAccounts(tx, [actorId]);
        const updated = await tx.aIJob.updateMany({
          where: { id: job.id, status: "QUEUED", attempts: 0 },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errorCode: "QUEUE_UNAVAILABLE",
          },
        });
        if (!updated.count) return;
        await tx.auditLog.create({
          data: {
            actorId,
            action: "AI_JOB_FAILED",
            entityType: "AIJob",
            entityId: job.id,
            payload: { code: "QUEUE_UNAVAILABLE" },
          },
        });
        try {
          await this.authorize(tx, await this.core.actor(actorId, tx), job);
        } catch {
          return;
        }
        await tx.notification.create({
          data: {
            userId: actorId,
            title: "AI analysis unavailable",
            body: "Your requested analysis could not be completed",
            type: "SYSTEM",
          },
        });
      });
    }
    return this.read(actorId, job.id);
  }

  private async authorize(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    job: AIJob,
  ) {
    if (job.actorId !== actor.userId)
      throw new ForbiddenException("AI job access denied");
    if (job.scopeKind === "GLOBAL" && !actor.globalAuthority)
      throw new ForbiddenException("AI scope revoked");
    if (
      job.scopeKind === "SUBSYSTEMS" &&
      (!job.subsystemIds.length ||
        job.subsystemIds.some((id) => !canManageSubsystem(actor, id)))
    )
      throw new ForbiddenException("AI scope revoked");
    if (!["GLOBAL", "SUBSYSTEMS", "PERSONAL"].includes(job.scopeKind))
      throw new ForbiddenException("Unknown AI scope");
    // Security/lifecycle revocation after submission invalidates queued and stored work.
    if (
      await tx.session.count({
        where: { userId: actor.userId, revokedAt: { gte: job.createdAt } },
      })
    )
      throw new ForbiddenException("AI session authority revoked");
  }

  private async context(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    job: AIJob,
  ) {
    await this.authorize(tx, actor, job);
    if (job.operation === "SUMMARY") return job.input;
    if (!Array.isArray(job.sourceRefs))
      throw new AiFailure("INVALID_PROVENANCE");
    const refs = job.sourceRefs.map((ref) => {
      if (
        !ref ||
        typeof ref !== "object" ||
        Array.isArray(ref) ||
        typeof ref.id !== "string" ||
        typeof ref.version !== "string"
      )
        throw new AiFailure("INVALID_PROVENANCE");
      return { id: ref.id, version: ref.version };
    });
    await this.core.lockTasks(
      tx,
      refs.map((ref) => ref.id),
    );
    const rows = await tx.task.findMany({
      where: {
        id: { in: refs.map((ref) => ref.id) },
        ...(job.scopeKind === "GLOBAL"
          ? {}
          : { subsystemId: { in: job.subsystemIds } }),
        deletedAt: null,
        isArchived: false,
      },
      select: sourceSelect,
      orderBy: { id: "asc" },
    });
    if (
      rows.length !== refs.length ||
      rows.some(
        (row) =>
          refs.find((ref) => ref.id === row.id)?.version !== version(row),
      )
    )
      throw new AiFailure("SOURCE_CHANGED");
    return rows;
  }

  private present(job: AIJob) {
    return {
      id: job.id,
      status: job.status,
      operation: job.operation,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      errorCode: job.errorCode,
      result: job.result,
      source: "ollama" as const,
    };
  }
  async read(actorId: string, id: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      const job = await tx.aIJob.findUnique({ where: { id } });
      if (!job) throw new NotFoundException("AI job not found");
      await this.authorize(tx, actor, job);
      if (job.status === "SUCCEEDED") {
        try {
          await this.context(tx, actor, job);
        } catch (error) {
          if (error instanceof AiFailure)
            throw new ConflictException({
              code: error.code,
              message: "AI result is stale or unavailable",
            });
          throw error;
        }
      }
      return this.present(job);
    });
  }
  async list(actorId: string) {
    await this.core.actor(actorId);
    const rows = await this.prisma.aIJob.findMany({
      where: { actorId },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const results = [];
    for (const row of rows) {
      try {
        results.push(await this.read(actorId, row.id));
      } catch (error) {
        if (!(
          error instanceof ForbiddenException ||
          error instanceof ConflictException
        ))
          throw error;
      }
    }
    return results;
  }
  async cancel(actorId: string, id: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${id} FOR UPDATE`;
      const job = await tx.aIJob.findUnique({ where: { id } });
      if (!job) throw new NotFoundException("AI job not found");
      if (actorId !== job.actorId && !actor.globalAuthority)
        throw new ForbiddenException("AI job access denied");
      if (job.status !== "QUEUED")
        throw new ConflictException("Only queued AI jobs can be cancelled");
      const result = await tx.aIJob.update({
        where: { id },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          nextAttemptAt: null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "AI_JOB_CANCELLED",
          entityType: "AIJob",
          entityId: id,
        },
      });
      return this.present(result);
    });
  }

  async execute(id: string) {
    const initial = await this.prisma.aIJob.findUnique({ where: { id } });
    if (!initial || initial.status !== "QUEUED") return;
    let attempt = initial.attempts;
    try {
      const claimed = await this.core.withActor(
        initial.actorId,
        async (tx, actor) => {
          await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${id} FOR UPDATE`;
          const job = await tx.aIJob.findUniqueOrThrow({ where: { id } });
          if (job.status !== "QUEUED") return null;
          if (job.attempts >= job.maxAttempts)
            throw new AiFailure("ATTEMPTS_EXHAUSTED");
          if (!this.config.enabled) throw new AiFailure("AI_DISABLED");
          if (
            job.model !== this.config.model ||
            job.templateVersion !== "antara-advisory-v1"
          )
            throw new AiFailure("CONFIGURATION_CHANGED");
          const context = await this.context(tx, actor, job);
          await tx.aIJob.update({
            where: { id },
            data: {
              status: "RUNNING",
              attempts: { increment: 1 },
              startedAt: new Date(),
              nextAttemptAt: null,
              errorCode: null,
            },
          });
          return { context, attempt: job.attempts + 1 };
        },
      );
      if (!claimed) return;
      attempt = claimed.attempt;
      if (Buffer.byteLength(JSON.stringify(claimed.context)) > 65536)
        throw new AiFailure("INPUT_TOO_LARGE");
      const started = Date.now();
      this.logger.log({
        jobId: id,
        operation: initial.operation,
        attempt,
        event: "AI_RUNNING",
      });
      const output = parseOutput(
        await this.provider.generate(claimed.context, initial.operation),
      );
      await this.core.withActor(initial.actorId, async (tx, actor) => {
        await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${id} FOR UPDATE`;
        const job = await tx.aIJob.findUniqueOrThrow({ where: { id } });
        if (job.status !== "RUNNING" || job.attempts !== attempt) return;
        await this.context(tx, actor, job);
        await tx.aIJob.update({
          where: { id },
          data: {
            status: "SUCCEEDED",
            result: output,
            completedAt: new Date(),
            errorCode: null,
          },
        });
        await tx.notification.create({
          data: {
            userId: job.actorId,
            title: "AI analysis completed",
            body: "Your requested insight is ready",
            type: "SYSTEM",
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: job.actorId,
            action: "AI_JOB_SUCCEEDED",
            entityType: "AIJob",
            entityId: id,
            payload: { attempt, operation: job.operation },
          },
        });
      });
      this.logger.log({
        jobId: id,
        operation: initial.operation,
        attempt,
        durationMs: Date.now() - started,
        event: "AI_SUCCEEDED",
      });
    } catch (error) {
      const failure =
        error instanceof AiFailure
          ? error
          : new AiFailure(
              error instanceof ForbiddenException
                ? "AUTHORITY_REVOKED"
                : "GENERATION_FAILED",
            );
      this.logger.warn({ jobId: id, attempt, code: failure.code });
      const retry = await this.prisma.$transaction(async (tx) => {
        await lockAccounts(tx, [initial.actorId]);
        await tx.$queryRaw`SELECT id FROM "AIJob" WHERE id = ${id} FOR UPDATE`;
        const job = await tx.aIJob.findUniqueOrThrow({ where: { id } });
        if (
          !["QUEUED", "RUNNING"].includes(job.status) ||
          job.attempts !== attempt
        )
          return false;
        const again = failure.retryable && job.attempts < job.maxAttempts;
        await tx.aIJob.update({
          where: { id },
          data: {
            status: again ? "QUEUED" : "FAILED",
            errorCode: failure.code,
            nextAttemptAt: again
              ? new Date(
                  Date.now() +
                    this.config.retryDelayMs *
                      2 ** Math.max(0, job.attempts - 1),
                )
              : null,
            completedAt: again ? null : new Date(),
          },
        });
        if (!again) {
          // Generic notification only when recipient still passes current authority.
          try {
            await this.authorize(
              tx,
              await this.core.actor(job.actorId, tx),
              job,
            );
          } catch {
            return false;
          }
          await tx.notification.create({
            data: {
              userId: job.actorId,
              title: "AI analysis unavailable",
              body: "Your requested analysis could not be completed",
              type: "SYSTEM",
            },
          });
        }
        return again;
      });
      if (retry) throw new AiFailure(failure.code, true);
    }
  }

  async reconcile(actorId: string, cursor?: string) {
    if (!(await this.core.actor(actorId)).globalAuthority)
      throw new ForbiddenException("OWNER required");
    const rows = await this.prisma.aIJob.findMany({
      orderBy: { id: "asc" },
      take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = [];
    for (const row of rows) {
      const queue = await this.queue.state(row.id);
      const issues: string[] = [];
      if (queue === "unavailable") issues.push("QUEUE_UNAVAILABLE");
      if (row.status === "QUEUED" && queue === "missing")
        issues.push("QUEUE_ENTRY_MISSING");
      if (
        row.status === "RUNNING" &&
        row.startedAt &&
        Date.now() - row.startedAt.getTime() > this.config.timeoutMs + 60000
      )
        issues.push("STALE_RUNNING");
      if (row.status === "SUCCEEDED" && !row.result)
        issues.push("RESULT_MISSING");
      if (
        ["failed", "completed"].includes(queue) &&
        ["QUEUED", "RUNNING"].includes(row.status)
      )
        issues.push("EXECUTION_STATE_MISMATCH");
      if (row.attempts >= row.maxAttempts && row.status === "QUEUED")
        issues.push("ATTEMPTS_EXHAUSTED");
      items.push({ id: row.id, status: row.status, issues });
    }
    return {
      items,
      nextCursor: rows.length === 100 ? rows[99]?.id : null,
      mode: "READ_ONLY",
    };
  }
}
