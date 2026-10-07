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
  ) {}

  async list() {
    return this.prisma.attachment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        task: true,
        uploadedBy: { select: safeUserSelect },
      },
      take: 60,
    });
  }

  async create(payload: CreateAttachmentDto, actorId: string) {
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
      return await this.prisma.attachment.create({
        data: {
          name: payload.name,
          mimeType: payload.mimeType,
          sizeBytes: Buffer.from(payload.contentBase64, "base64").length,
          storageUrl:
            uploaded.webViewLink ??
            `https://drive.google.com/file/d/${encodeURIComponent(uploaded.id)}/view`,
          driveFileId: uploaded.id,
          tags: payload.tags ?? [],
          taskId: payload.taskId ?? null,
          uploadedById: actorId,
        },
        include: { task: true, uploadedBy: { select: safeUserSelect } },
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

  async delete(attachmentId: string, actorId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment) {
      return { deleted: false };
    }

    await this.prisma.attachment.delete({
      where: { id: attachmentId },
    });

    await this.auditService.log({
      action: "DELETE",
      entityType: "Attachment",
      entityId: attachmentId,
      actorId,
      payload: { name: attachment.name, taskId: attachment.taskId },
    });

    return { deleted: true };
  }
}
