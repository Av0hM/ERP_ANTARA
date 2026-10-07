import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { safeUserSelect } from "../../common/prisma/safe-user.select";
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { GoogleIntegrationService } from "../../common/integrations/google.integration.service";
import { AuditService } from "../audit/audit.service";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleIntegration: GoogleIntegrationService,
    private readonly auditService: AuditService,
    private readonly core: CoreAuthorizationService,
  ) {}

  async list(actorId: string) {
    const actor = await this.core.actor(actorId);
    return this.prisma.attachment.findMany({
      where: actor.globalAuthority
        ? {}
        : {
            task: {
              ...this.core.taskWhere(actor),
              deletedAt: null,
              isArchived: false,
            },
          },
      orderBy: { createdAt: "desc" },
      include: {
        task: { select: { id: true, title: true, subsystemId: true } },
        uploadedBy: { select: safeUserSelect },
      },
      take: 60,
    });
  }

  async create(payload: CreateAttachmentDto, actorId: string) {
    await this.core.withActor(actorId, (tx, actor) =>
      this.authorizeTarget(tx, actor, payload.taskId),
    );
    if (!payload.contentBase64) {
      throw new BadRequestException({
        code: "ATTACHMENT_CONTENT_REQUIRED",
        message: "File content is required",
      });
    }
    if (!this.googleIntegration.isDriveConfigured()) {
      throw new ServiceUnavailableException({
        code: "STORAGE_NOT_CONFIGURED",
        message: "Attachment storage is not configured",
      });
    }
    const sizeBytes = Buffer.from(payload.contentBase64, "base64").length;
    let uploaded: { id: string; webViewLink?: string };
    try {
      const result = await this.googleIntegration.uploadDriveFile({
        name: payload.name,
        mimeType: payload.mimeType,
        contentBase64: payload.contentBase64,
      });
      if (!result?.id) throw new Error("Missing provider file ID");
      uploaded = result;
    } catch {
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "File upload failed; attachment was not saved",
      });
    }
    try {
      return await this.core.withActor(actorId, async (tx, actor) => {
        await this.authorizeTarget(tx, actor, payload.taskId);
        const attachment = await tx.attachment.create({
          data: {
            name: payload.name,
            mimeType: payload.mimeType,
            sizeBytes,
            storageUrl:
              uploaded.webViewLink ??
              `https://drive.google.com/file/d/${encodeURIComponent(uploaded.id)}/view`,
            driveFileId: uploaded.id,
            tags: payload.tags ?? [],
            taskId: payload.taskId ?? null,
            uploadedById: actorId,
          },
          include: {
            task: { select: { id: true, title: true, subsystemId: true } },
            uploadedBy: { select: safeUserSelect },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "CREATE",
            entityType: "Attachment",
            entityId: attachment.id,
            payload: { taskId: attachment.taskId },
          },
        });
        return attachment;
      });
    } catch (error) {
      try {
        await this.googleIntegration.deleteDriveFile(uploaded.id);
      } catch {
        this.logger.error(
          "Attachment compensation failed; provider reconciliation required",
        );
      }
      throw error;
    }
  }

  private async authorizeTarget(
    tx: Prisma.TransactionClient,
    actor: Awaited<ReturnType<CoreAuthorizationService["actor"]>>,
    taskId?: string | null,
  ) {
    if (!taskId) {
      if (!actor.globalAuthority)
        throw new ForbiddenException("Unscoped attachments require OWNER");
      return;
    }
    await this.core.lockTasks(tx, [taskId]);
    if (actor.globalAuthority) {
      // Historical/archived tasks do not remove OWNER's attachment management.
      if (
        !(await tx.task.findUnique({
          where: { id: taskId },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Task not found");
      return;
    }
    await this.core.task(actor, taskId, "manage", tx);
  }

  async delete(attachmentId: string, actorId: string) {
    return this.core.withActor(actorId, async (tx, actor) => {
      // Attachment row serializes relationship changes; then lock persisted Task.
      await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${attachmentId} FOR UPDATE`;
      const attachment = await tx.attachment.findUnique({
        where: { id: attachmentId },
        select: { id: true, taskId: true },
      });
      if (!attachment) throw new NotFoundException("Attachment not found");
      await this.authorizeTarget(tx, actor, attachment.taskId);
      await tx.attachment.delete({ where: { id: attachmentId } });
      await tx.auditLog.create({
        data: {
          action: "DELETE",
          entityType: "Attachment",
          entityId: attachmentId,
          actorId,
          payload: { taskId: attachment.taskId },
        },
      });
      return { deleted: true };
    });
  }
}
