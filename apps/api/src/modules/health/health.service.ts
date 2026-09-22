import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../common/prisma/prisma.service";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: Date;
  checks: {
    database: { status: "healthy" | "degraded" | "unhealthy"; latencyMs: number };
    redis: { status: "healthy" | "degraded" | "unhealthy"; latencyMs: number };
    memory: { usedMb: number; totalMb: number; percentage: number };
    disk: { freeGb: number; totalGb: number; percentage: number };
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async checkHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkDisk(),
    ]);

    const [dbResult, redisResult, memoryResult, diskResult] = checks;

    const getStatus = (result: PromiseSettledResult<any>): string => {
      if (result.status === "fulfilled" && result.value && typeof result.value === "object" && "status" in result.value) {
        return result.value.status;
      }
      return "unhealthy";
    };

    const hasUnhealthy = checks.some(
      (r) => r.status === "fulfilled" && getStatus(r) === "unhealthy",
    );
    const hasDegraded = checks.some(
      (r) => r.status === "fulfilled" && getStatus(r) === "degraded",
    );

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (hasUnhealthy) overallStatus = "unhealthy";
    else if (hasDegraded) overallStatus = "degraded";

    return {
      status: overallStatus,
      timestamp: new Date(),
      checks: {
        database: dbResult.status === "fulfilled" ? dbResult.value : { status: "unhealthy", latencyMs: -1 },
        redis: redisResult.status === "fulfilled" ? redisResult.value : { status: "unhealthy", latencyMs: -1 },
        memory: memoryResult.status === "fulfilled" ? memoryResult.value : { usedMb: 0, totalMb: 0, percentage: 0 },
        disk: diskResult.status === "fulfilled" ? diskResult.value : { freeGb: 0, totalGb: 0, percentage: 0 },
      },
    };
  }

  private async checkDatabase(): Promise<{ status: "healthy" | "degraded" | "unhealthy"; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return { status: latencyMs < 100 ? "healthy" : "degraded", latencyMs };
    } catch {
      return { status: "unhealthy", latencyMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<{ status: "healthy" | "degraded" | "unhealthy"; latencyMs: number }> {
    const start = Date.now();
    try {
      // If Redis is not configured, return healthy
      const redisUrl = this.configService.get<string>("redis.url");
      if (!redisUrl) {
        return { status: "healthy", latencyMs: 0 };
      }
      // In a real implementation, you would ping Redis here
      const latencyMs = Date.now() - start;
      return { status: latencyMs < 50 ? "healthy" : "degraded", latencyMs };
    } catch {
      return { status: "unhealthy", latencyMs: Date.now() - start };
    }
  }

  private checkMemory(): { usedMb: number; totalMb: number; percentage: number } {
    const used = process.memoryUsage();
    const usedMb = Math.round(used.heapUsed / 1024 / 1024);
    const totalMb = Math.round(used.heapTotal / 1024 / 1024);
    const percentage = Math.round((used.heapUsed / used.heapTotal) * 100);
    return { usedMb, totalMb, percentage };
  }

  private checkDisk(): { freeGb: number; totalGb: number; percentage: number } {
    // In a real implementation, you would check disk space
    // For now, return mock values
    return { freeGb: 50, totalGb: 100, percentage: 50 };
  }
}