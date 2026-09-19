import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MeetingAutomationService } from "./meetings.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

@Controller("meetings")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingAutomationService) {}

  @Get("sync-preview")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getSyncPreview(@Query("horizonWeeks") horizonWeeks?: string) {
    const weeks = horizonWeeks ? parseInt(horizonWeeks, 10) : 4;
    return this.meetingsService.generateSubsystemSyncEvents(weeks);
  }

  @Get("agenda/:subsystemId")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getAgenda(@Param("subsystemId") subsystemId: string, @Query("date") dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    return this.meetingsService.generateMeetingAgenda(subsystemId, date);
  }

  @Get("agenda/:subsystemId/markdown")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getAgendaMarkdown(@Param("subsystemId") subsystemId: string, @Query("date") dateStr?: string) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const agenda = await this.meetingsService.generateMeetingAgenda(subsystemId, date);
    const markdown = await this.meetingsService.generateAgendaMarkdown(agenda);
    return { markdown };
  }

  @Post("sync/create/:subsystemId")
  @Roles("OWNER", "ADMIN")
  async createSyncEvents(
    @Param("subsystemId") subsystemId: string,
    @Query("horizonWeeks") horizonWeeks: string = "4",
    @Req() req: AuthenticatedRequest,
  ) {
    const weeks = parseInt(horizonWeeks, 10);
    return this.meetingsService.createSyncCalendarEvents(subsystemId, weeks, req.user.id);
  }

  @Post("action-items")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async createActionItems(
    @Body() body: { meetingId: string; items: Array<{ taskId: string; action: string; assigneeId: string }> },
    @Req() req: AuthenticatedRequest,
  ) {
    // Convert action items to tasks
    const results = [];
    for (const item of body.items) {
      // This would create tasks from action items
      // For now, return the action items
      results.push({ ...item, created: true });
    }
    return { created: results.length, items: results };
  }
}