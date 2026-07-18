import { Controller, Get, UseGuards } from "@nestjs/common";

import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getOverview() {
    return this.analyticsService.getOwnerOverview();
  }

  @Get("bundle")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getBundle() {
    return this.analyticsService.getBundle();
  }

  @Get("velocity")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getVelocity() {
    return this.analyticsService.getVelocityTrend();
  }

  @Get("heatmap")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getHeatmap() {
    return this.analyticsService.getHeatmap();
  }

  @Get("subsystems")
  @Roles("OWNER", "ADMIN", "MEMBER")
  getSubsystems() {
    return this.analyticsService.getSubsystemBreakdown();
  }
}
