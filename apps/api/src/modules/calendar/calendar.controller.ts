import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CalendarService } from "./calendar.service";
import { CreateCalendarEventDto } from "./dto/create-calendar-event.dto";

@Controller("calendar")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get("events")
  @Roles("OWNER", "ADMIN", "MEMBER")
  list(@CurrentUser() actor: { id: string }) {
    return this.calendarService.list(actor.id);
  }

  @Post("events")
  @Roles("OWNER", "ADMIN")
  create(
    @Body() payload: CreateCalendarEventDto,
    @CurrentUser() actor: { id: string },
  ) {
    return this.calendarService.create(payload, actor.id);
  }
}
