import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  const prisma = {
    analyticsSnapshot: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
    workLog: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };
  const cache = {
    getJson: jest.fn(),
    setJson: jest.fn(),
  };

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.getJson.mockResolvedValue(null);
    cache.setJson.mockResolvedValue(undefined);
    prisma.analyticsSnapshot.findFirst.mockResolvedValue(null);
    service = new AnalyticsService(prisma as never, cache as never);
  });

  it("falls back to seeded velocity data when no snapshots exist", async () => {
    prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

    await expect(service.getVelocityTrend()).resolves.toEqual([
      { label: "W1", value: 54 },
      { label: "W2", value: 63 },
      { label: "W3", value: 61 },
      { label: "W4", value: 72 },
      { label: "W5", value: 84 },
    ]);
  });

  it("returns a cached bundle from the computed overview", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.workLog.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

    await expect(service.getBundle()).resolves.toMatchObject({
      overview: {
        productivityIndex: expect.any(Number),
      },
      velocity: expect.any(Array),
      heatmap: expect.any(Array),
      subsystems: expect.any(Array),
    });
  });
});
