import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReportsService } from "./reports.service";

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; name: string; role: string };
}

@Controller("reports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("handoff")
  @Roles("OWNER", "ADMIN")
  async getHandoffPackage(@Req() req: AuthenticatedRequest) {
    return this.reportsService.generateHandoffPackage(req.user.id);
  }

  @Get("handoff/markdown")
  @Roles("OWNER", "ADMIN")
  async getHandoffMarkdown(@Req() req: AuthenticatedRequest) {
    const markdown = await this.reportsService.generateMarkdownHandoff(req.user.id);
    return { markdown };
  }

  @Get("handoff/download")
  @Roles("OWNER", "ADMIN")
  async downloadHandoff(@Req() req: AuthenticatedRequest) {
    const markdown = await this.reportsService.generateMarkdownHandoff(req.user.id);
    return { content: markdown, filename: `antara-handoff-${new Date().toISOString().split("T")[0]}.md` };
  }
}