import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../common/decorators/current-user.decorator";
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
  async getOverview(
    @CurrentUser() user: { id: string },
    @Query("subsystemId") subsystemId?: string,
  ) {
    const scope = await this.analyticsService.resolveScope(
      user.id,
      subsystemId,
    );
    return this.analyticsService.getOverview(scope);
  }

  @Get("bundle")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getBundle(
    @CurrentUser() user: { id: string },
    @Query("subsystemId") subsystemId?: string,
  ) {
    const scope = await this.analyticsService.resolveScope(
      user.id,
      subsystemId,
    );
    return this.analyticsService.getBundle(scope);
  }

  @Get("velocity")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getVelocity(
    @CurrentUser() user: { id: string },
    @Query("subsystemId") subsystemId?: string,
  ) {
    const scope = await this.analyticsService.resolveScope(
      user.id,
      subsystemId,
    );
    return this.analyticsService.getVelocityTrend(scope);
  }

  @Get("heatmap")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getHeatmap(
    @CurrentUser() user: { id: string },
    @Query("subsystemId") subsystemId?: string,
  ) {
    const scope = await this.analyticsService.resolveScope(
      user.id,
      subsystemId,
    );
    return this.analyticsService.getHeatmap(scope);
  }

  @Get("subsystems")
  @Roles("OWNER", "ADMIN", "MEMBER")
  async getSubsystems(
    @CurrentUser() user: { id: string },
    @Query("subsystemId") subsystemId?: string,
  ) {
    const scope = await this.analyticsService.resolveScope(
      user.id,
      subsystemId,
    );
    return this.analyticsService.getSubsystemBreakdown(scope);
  }
}
