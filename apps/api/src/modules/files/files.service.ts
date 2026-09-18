import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../common/prisma/prisma.service";
import { GoogleIntegrationService } from "../../common/integrations/google.integration.service";
import { AuditService } from "../audit/audit.service";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";

@Injectable()
export class FilesService {
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
        uploadedBy: true,
      },
      take: 60,
    });
  }

  async create(payload: CreateAttachmentDto) {
    let driveResult: { id: string; webViewLink?: string } | null = null;

    if (payload.contentBase64) {
      try {
        driveResult = await this.googleIntegration.uploadDriveFile({
          name: payload.name,
          mimeType: payload.mimeType,
          contentBase64: payload.contentBase64,
        });
      } catch {
        driveResult = null;
      }
    }

    return this.prisma.attachment.create({
      data: {
        name: payload.name,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        storageUrl: driveResult?.webViewLink ?? `local://attachments/${encodeURIComponent(payload.name)}`,
        driveFileId: driveResult?.id ?? null,
        tags: payload.tags ?? [],
        taskId: payload.taskId ?? null,
        uploadedById: payload.uploadedById ?? null,
      },
      include: {
        task: true,
        uploadedBy: true,
      },
    });
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
