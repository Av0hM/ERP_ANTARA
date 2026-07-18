import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";
import { FilesService } from "./files.service";

@Controller("files")
@UseGuards(JwtAuthGuard, RolesGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get("attachments")
  @Roles("OWNER", "ADMIN", "MEMBER")
  listAttachments() {
    return this.filesService.list();
  }

  @Post("attachments")
  @Roles("OWNER", "ADMIN")
  createAttachment(@Body() payload: CreateAttachmentDto) {
    return this.filesService.create(payload);
  }
}
