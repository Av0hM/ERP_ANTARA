import { HealthService } from "./health.service";

describe("HealthService", () => {
  let prisma: { $queryRaw: jest.Mock };
  let redisCacheService: { ping: jest.Mock };
  let configService: { get: jest.Mock };
  let configNoRedis: { get: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
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
    service = new HealthService(prisma as never, configService as never, redisCacheService as never);
  });

  describe("checkHealth", () => {
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

    it("returns unhealthy when redis check fails", async () => {
      prisma.$queryRaw.mockResolvedValue(null);
      redisCacheService.ping.mockRejectedValue(new Error("Redis connection failed"));

      const result = await service.checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.checks.redis.status).toBe("unhealthy");
    });

    it("returns unhealthy when a check is rejected", async () => {
      prisma.$queryRaw.mockRejectedValue(new Error("DB error"));
      redisCacheService.ping.mockRejectedValue(new Error("Redis error"));

      const result = await service.checkHealth();

      expect(result.status).toBe("unhealthy");
      expect(result.checks.database.status).toBe("unhealthy");
      expect(result.checks.redis.status).toBe("unhealthy");
    });

    it("returns healthy when redis is not configured", async () => {
      const configNoRedis = {
        get: jest.fn(() => undefined),
      } as never;

      const serviceNoRedis = new HealthService(prisma as never, configNoRedis, redisCacheService as never);
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

    it("returns unhealthy when ping fails", async () => {
      redisCacheService.ping.mockRejectedValue(new Error("Redis down"));

      const result = await service["checkRedis"]();

      expect(result.status).toBe("unhealthy");
    });

    it("returns healthy when redis is not configured", async () => {
      const configNoRedis = {
        get: jest.fn(() => undefined),
      } as never;

      const serviceNoRedis = new HealthService(prisma as never, configNoRedis, redisCacheService as never);

      const result = await serviceNoRedis["checkRedis"]();

      expect(result.status).toBe("healthy");
      expect(result.latencyMs).toBe(0);
    });
  });
});