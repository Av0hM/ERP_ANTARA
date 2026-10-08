import {
  BadRequestException,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { UploadInterceptor } from "./upload.interceptor";
import { UploadFileDto } from "./dto/upload-file.dto";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";
import { FilesService } from "./files.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

@Controller("files")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get("attachments")
  @Roles("OWNER", "ADMIN", "MEMBER")
  listAttachments(
    @CurrentUser() actor: { id: string },
    @Query("deleted") deleted?: string,
  ) {
    return this.filesService.list(actor.id, deleted === "true");
  }

  @Post("upload")
  @Roles("OWNER", "ADMIN")
  @UseInterceptors(UploadInterceptor)
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: UploadFileDto,
    @CurrentUser() actor: { id: string },
  ) {
    if (!file) throw new BadRequestException("File content is required");
    return this.filesService.upload(
      {
        path: file.path,
        name: file.originalname,
        mimeType: file.mimetype,
        category: body.category,
        taskId: body.taskId,
      },
      actor.id,
    );
  }

  @Get("reconciliation")
  @Roles("OWNER")
  reconcile(
    @CurrentUser() actor: { id: string },
    @Query("cursor") cursor?: string,
  ) {
    return this.filesService.reconcile(actor.id, cursor);
  }

  @Get("reconciliation/orphans/:provider")
  @Roles("OWNER")
  orphans(
    @CurrentUser() actor: { id: string },
    @Param("provider") provider: string,
    @Query("cursor") cursor?: string,
  ) {
    if (provider !== "DRIVE" && provider !== "S3")
      throw new BadRequestException("Invalid provider");
    return this.filesService.orphans(actor.id, provider, cursor);
  }

  @Get(":id/open")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async open(
    @Param("id") id: string,
    @CurrentUser() actor: { id: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.filesService.open(id, actor.id);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (file.access.kind === "url") return file.access;
    // Attachment disposition prevents uploaded active content executing at the API origin.
    return new StreamableFile(file.access.stream, {
      type: "application/octet-stream",
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      length: file.sizeBytes,
    });
  }

  @Post(":id/restore")
  @Roles("OWNER", "ADMIN")
  restore(@Param("id") id: string, @CurrentUser() actor: { id: string }) {
    return this.filesService.restore(id, actor.id);
  }

  @Post(":id/purge")
  @Roles("OWNER")
  purge(@Param("id") id: string, @CurrentUser() actor: { id: string }) {
    return this.filesService.purge(id, actor.id);
  }

  @Post("attachments")
  @Roles("OWNER", "ADMIN")
  createAttachment(
    @Body() payload: CreateAttachmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.filesService.create(payload, req.user.id);
  }

  @Delete("attachments/:id")
  @Roles("OWNER", "ADMIN")
  deleteAttachment(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.filesService.delete(id, req.user.id);
  }
}
