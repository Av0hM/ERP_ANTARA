import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";

import { MetricsService } from "./metrics.service";

@Controller("metrics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("OWNER")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response) {
    try {
      const metrics = await this.metricsService.getMetrics();
      res.set("Content-Type", this.metricsService.getContentType());
      res.send(metrics);
    } catch (error) {
      res.status(500).send("Error generating metrics");
    }
  }
}
