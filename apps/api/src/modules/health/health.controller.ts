import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";

import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const health = await this.healthService.checkHealth();
    if (health.status === "unhealthy") {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }

  @Get("ready")
  @HttpCode(HttpStatus.OK)
  async readiness() {
    const health = await this.healthService.checkHealth();
    if (health.status === "unhealthy") {
      throw new ServiceUnavailableException(health);
    }
    return { ready: true, status: health.status };
  }

  @Get("live")
  async liveness() {
    return { alive: true, timestamp: new Date() };
  }
}