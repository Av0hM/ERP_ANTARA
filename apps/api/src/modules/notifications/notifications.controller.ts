import { CurrentUser } from "../../common/decorators/current-user.decorator";
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Query,
  Patch,
  UseGuards,
} from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { UpdateNotificationDto } from "./dto/update-notification.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Roles("OWNER", "ADMIN", "MEMBER")
  list(@CurrentUser() actor: { id: string }) {
    return this.notificationsService.list(actor.id);
  }

  @Get("history")
  @Roles("OWNER", "ADMIN", "MEMBER")
  history(
    @CurrentUser() actor: { id: string },
    @Query("cursor") cursor?: string,
  ) {
    return this.notificationsService.history(actor.id, cursor);
  }

  @Patch("read-all")
  @Roles("OWNER", "ADMIN", "MEMBER")
  markAllRead(@CurrentUser() actor: { id: string }) {
    return this.notificationsService.markAllRead(actor.id);
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  update(
    @Param("id") id: string,
    @Body() payload: UpdateNotificationDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.notificationsService.update(id, payload, actor.id);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  delete(@Param("id") id: string, @CurrentUser() actor: { id: string }) {
    return this.notificationsService.delete(id, actor.id);
  }
}
