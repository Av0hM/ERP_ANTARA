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
      findUnique: jest.fn(),
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

  it("returns empty velocity when no snapshots exist", async () => {
    prisma.analyticsSnapshot.findMany.mockResolvedValue([]);

    await expect(service.getVelocityTrend()).resolves.toEqual([]);
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
  it("resolves current DB roles and denies unassigned admins a global scope", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "admin", role: "ADMIN", isActive: true, subsystemId: "software" });
    await expect(service.resolveScope("admin")).resolves.toEqual({ kind: "SUBSYSTEM", id: "software" });
    prisma.user.findUnique.mockResolvedValue({ id: "admin", role: "ADMIN", isActive: true, subsystemId: null });
    await expect(service.resolveScope("admin")).resolves.toEqual({ kind: "EMPTY", id: "admin" });
    prisma.user.findUnique.mockResolvedValue({ id: "member", role: "MEMBER", isActive: true });
    await expect(service.resolveScope("member")).resolves.toEqual({ kind: "PERSONAL", id: "member" });
  });

  it("scopes admin tasks, task-linked worklogs, availability, and cache keys", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.workLog.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    await service.getSubsystemOverview("software");
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ subsystemId: "software" }) }));
    expect(prisma.workLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ task: { subsystemId: "software" } }) }));
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ subsystemId: "software" }) }));
    expect(cache.getJson).toHaveBeenCalledWith("analytics:overview:SUBSYSTEM:software");
  });

  it("scopes member tasks separately from personally authored worklogs", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.workLog.findMany.mockResolvedValue([]);
    prisma.user.findMany.mockResolvedValue([]);
    await service.getPersonalOverview("member");
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignedToId: "member" }) }));
    expect(prisma.workLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "member" }) }));
    expect(cache.getJson).toHaveBeenCalledWith("analytics:overview:PERSONAL:member");
  });

  it("does not return global historical snapshots for a member", async () => {
    prisma.analyticsSnapshot.findMany.mockResolvedValue([]);
    await expect(service.getVelocityTrend({ kind: "PERSONAL", id: "member" })).resolves.toEqual([]);
    expect(prisma.analyticsSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { scope: "PERSONAL:member" } }));
  });

});
