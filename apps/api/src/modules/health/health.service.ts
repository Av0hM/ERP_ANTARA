import { statfs } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "../../common/prisma/prisma.service";
import { RedisCacheService } from "../../common/cache/redis-cache.service";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: Date;
  checks: {
    database: {
      status: "healthy" | "degraded" | "unhealthy";
      latencyMs: number;
    };
    redis: { status: "healthy" | "degraded" | "unhealthy"; latencyMs: number };
    memory: {
      status: "healthy" | "degraded" | "unhealthy";
      usedMb: number;
      totalMb: number;
      percentage: number;
    };
    disk: {
      status: "healthy" | "degraded" | "unhealthy";
      freeGb: number;
      totalGb: number;
      percentage: number;
    };
  };
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisCacheService: RedisCacheService,
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

    const getStatus = (
      result: PromiseSettledResult<{
        status: "healthy" | "degraded" | "unhealthy";
      }>,
    ): string => {
      if (
        result.status === "fulfilled" &&
        result.value &&
        typeof result.value === "object" &&
        "status" in result.value
      ) {
        return result.value.status;
      }
      return "unhealthy";
    };

    const coreChecks = [dbResult, diskResult];
    const hasRejected = coreChecks.some((r) => r.status === "rejected");
    const hasUnhealthy = coreChecks.some(
      (r) => r.status === "fulfilled" && getStatus(r) === "unhealthy",
    );
    const hasDegraded = checks.some(
      (r) => r.status === "fulfilled" && getStatus(r) !== "healthy",
    );

    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    if (hasRejected || hasUnhealthy) overallStatus = "unhealthy";
    else if (hasDegraded) overallStatus = "degraded";

    return {
      status: overallStatus,
      timestamp: new Date(),
      checks: {
        database:
          dbResult.status === "fulfilled"
            ? dbResult.value
            : { status: "unhealthy", latencyMs: -1 },
        redis:
          redisResult.status === "fulfilled"
            ? redisResult.value
            : { status: "unhealthy", latencyMs: -1 },
        memory:
          memoryResult.status === "fulfilled"
            ? memoryResult.value
            : { status: "unhealthy", usedMb: 0, totalMb: 0, percentage: 0 },
        disk:
          diskResult.status === "fulfilled"
            ? diskResult.value
            : { status: "unhealthy", freeGb: 0, totalGb: 0, percentage: 0 },
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return { status: latencyMs < 100 ? "healthy" : "degraded", latencyMs };
    } catch {
      return { status: "unhealthy", latencyMs: Date.now() - start };
    }
  }

  private async checkRedis(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      // If Redis is not configured, return healthy
      const redisUrl = this.configService.get<string>("redis.url");
      if (!redisUrl) {
        return { status: "healthy", latencyMs: 0 };
      }

      await this.redisCacheService.ping();

      const latencyMs = Date.now() - start;
      return { status: latencyMs < 50 ? "healthy" : "degraded", latencyMs };
    } catch {
      return { status: "degraded", latencyMs: Date.now() - start };
    }
  }

  private checkMemory(): {
    status: "healthy" | "degraded" | "unhealthy";
    usedMb: number;
    totalMb: number;
    percentage: number;
  } {
    const used = process.memoryUsage();
    const usedMb = Math.round(used.heapUsed / 1024 / 1024);
    const totalMb = Math.round(used.heapTotal / 1024 / 1024);
    const percentage = Math.round((used.heapUsed / used.heapTotal) * 100);
    // Consider healthy if memory usage is under 90%
    return {
      status: percentage < 90 ? "healthy" : "degraded",
      usedMb,
      totalMb,
      percentage,
    };
  }

  private async checkDisk(): Promise<HealthCheckResult["checks"]["disk"]> {
    const disk = await statfs(tmpdir());
    const total = disk.blocks * disk.bsize;
    const free = disk.bavail * disk.bsize;
    const percentage = total ? Math.round((1 - free / total) * 100) : 100;
    return {
      status:
        percentage >= 99
          ? "unhealthy"
          : percentage >= 90
            ? "degraded"
            : "healthy",
      freeGb: free / 1024 ** 3,
      totalGb: total / 1024 ** 3,
      percentage,
    };
  }
}
