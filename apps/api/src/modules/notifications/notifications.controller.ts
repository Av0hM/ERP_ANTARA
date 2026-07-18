import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from "@nestjs/common";

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
  list() {
    return this.notificationsService.list();
  }

  @Patch(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  update(@Param("id") id: string, @Body() payload: UpdateNotificationDto) {
    return this.notificationsService.update(id, payload);
  }

  @Delete(":id")
  @Roles("OWNER", "ADMIN", "MEMBER")
  delete(@Param("id") id: string) {
    return this.notificationsService.delete(id);
  }
}
