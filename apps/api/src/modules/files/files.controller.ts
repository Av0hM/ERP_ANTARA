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
  listAttachments(@CurrentUser() actor: { id: string }) {
    return this.filesService.list(actor.id);
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
