import { Controller, Get } from "@nestjs/common";

import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  async check() {
    return this.healthService.checkHealth();
  }

  @Get("ready")
  async readiness() {
    const health = await this.healthService.checkHealth();
    return { ready: health.status !== "unhealthy", status: health.status };
  }

  @Get("live")
  async liveness() {
    return { alive: true, timestamp: new Date() };
  }
}