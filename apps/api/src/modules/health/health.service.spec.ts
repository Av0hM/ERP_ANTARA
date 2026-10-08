import { statfs } from "node:fs/promises";
jest.mock("node:fs/promises", () => ({ statfs: jest.fn() }));
import { HealthService } from "./health.service";

describe("HealthService", () => {
  let prisma: { $queryRaw: jest.Mock };
  let redisCacheService: { ping: jest.Mock };
  let configService: { get: jest.Mock };
  let configNoRedis: { get: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(statfs).mockResolvedValue({
      bsize: 4096,
      blocks: 100000,
      bavail: 60000,
      bfree: 60000,
      files: 1000,
      ffree: 900,
      type: 0,
    });
    // The suite's own heap pressure is not the system state under test.
    jest.spyOn(process, "memoryUsage").mockReturnValue({
      rss: 100_000_000,
      heapTotal: 100_000_000,
      heapUsed: 50_000_000,
      external: 0,
      arrayBuffers: 0,
    });
    prisma = { $queryRaw: jest.fn() };
    redisCacheService = { ping: jest.fn() };
    configService = {
      get: jest.fn((key: string) => {
        if (key === "redis.url") return "rediss://default:password@host:6379";
        return undefined;
      }),
    };
    configNoRedis = {
      get: jest.fn(() => undefined),
    };
    service = new HealthService(
      prisma as never,
      configService as never,
      redisCacheService as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe("checkHealth", () => {
    it("measures disk capacity rather than reporting fabricated values", async () => {
      const result = await service.checkHealth();
      expect(result.checks.disk.totalGb).toBe(409600000 / 1024 ** 3);
      expect(result.checks.disk.percentage).toBe(40);
    });
    it("fails readiness when disk measurement fails", async () => {
      jest.mocked(statfs).mockRejectedValue(new Error("Unavailable"));
      const result = await service.checkHealth();
      expect(result.status).toBe("unhealthy");
    });
    it("returns degraded for actual high memory usage", async () => {
      jest.spyOn(process, "memoryUsage").mockReturnValue({
        rss: 100_000_000,
        heapTotal: 100_000_000,
        heapUsed: 95_000_000,
        external: 0,
        arrayBuffers: 0,
      });
      prisma.$queryRaw.mockResolvedValue(null);
      redisCacheService.ping.mockResolvedValue("PONG");
      const result = await service.checkHealth();
      expect(result.status).toBe("degraded");
      expect(result.checks.memory.percentage).toBe(95);
    });
    it("returns healthy when all checks pass", async () => {
      prisma.$queryRaw.mockResolvedValue(null);
      redisCacheService.ping.mockResolvedValue("PONG");

      const result = await service.checkHealth();

      expect(result.status).toBe("healthy");
      expect(result.checks.database.status).toBe("healthy");
      expect(result.checks.redis.status).toBe("healthy");
      expect(result.checks.memory).toBeDefined();
      expect(result.checks.disk).toBeDefined();
    });

    it("returns unhealthy when database check fails", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("DB connection failed"));
      redisCacheService.ping.mockResolvedValue("PONG");

      const result = await service.checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.checks.database.status).toBe("unhealthy");
    });

    it("returns degraded when optional redis check fails", async () => {
      prisma.$queryRaw.mockResolvedValue(null);
      redisCacheService.ping.mockRejectedValue(
        new Error("Redis connection failed"),
      );

      const result = await service.checkHealth();

      expect(result.status).toBe("degraded");
      expect(result.checks.redis.status).toBe("degraded");
    });

    it("returns unhealthy when a check is rejected", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("DB error"));
      redisCacheService.ping.mockRejectedValue(new Error("Redis error"));

      const result = await service.checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.checks.database.status).toBe("unhealthy");
      expect(result.checks.redis.status).toBe("degraded");
    });

    it("returns healthy when redis is not configured", async () => {
      const configNoRedis = {
        get: jest.fn(() => undefined),
      } as never;

      const serviceNoRedis = new HealthService(
        prisma as never,
        configNoRedis,
        redisCacheService as never,
      );
      prisma.$queryRaw.mockResolvedValue(null);

      const result = await serviceNoRedis.checkHealth();

      expect(result.status).toBe("healthy");
      expect(result.checks.redis.status).toBe("healthy");
      expect(result.checks.redis.latencyMs).toBe(0);
    });

    it("returns degraded when database latency is high", async () => {
      prisma.$queryRaw.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(null), 150)),
      );
      redisCacheService.ping.mockResolvedValue("PONG");

      const result = await service.checkHealth();

      expect(result.checks.database.status).toBe("degraded");
    });
  });

  describe("checkRedis", () => {
    it("returns healthy when ping succeeds", async () => {
      redisCacheService.ping.mockResolvedValue("PONG");

      const result = await service["checkRedis"]();

      expect(result.status).toBe("healthy");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("returns degraded when ping fails", async () => {
      redisCacheService.ping.mockRejectedValue(new Error("Redis down"));

      const result = await service["checkRedis"]();

      expect(result.status).toBe("degraded");
    });

    it("returns healthy when redis is not configured", async () => {
      const configNoRedis = {
        get: jest.fn(() => undefined),
      } as never;

      const serviceNoRedis = new HealthService(
        prisma as never,
        configNoRedis,
        redisCacheService as never,
      );

      const result = await serviceNoRedis["checkRedis"]();

      expect(result.status).toBe("healthy");
      expect(result.latencyMs).toBe(0);
    });
  });
});
