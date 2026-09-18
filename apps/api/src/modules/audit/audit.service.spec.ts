import { PrismaService } from "../../common/prisma/prisma.service";

import { AuditService } from "./audit.service";

describe("AuditService", () => {
  const prisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService(prisma);
  });

  it("logs an audit entry", async () => {
    prisma.auditLog.create.mockResolvedValue({
      id: "audit-1",
      action: "LOGIN",
      entityType: "User",
      entityId: "user-1",
      actorId: "user-1",
      payload: { email: "test@example.com" },
      createdAt: new Date(),
    });

    const result = await service.log({
      action: "LOGIN",
      entityType: "User",
      entityId: "user-1",
      actorId: "user-1",
      payload: { email: "test@example.com" },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: "LOGIN",
        entityType: "User",
        entityId: "user-1",
        actorId: "user-1",
        payload: { email: "test@example.com" },
      },
    });
    expect(result?.action).toBe("LOGIN");
  });

  it("returns null on database error without throwing", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("Database error"));

    const result = await service.log({
      action: "LOGIN",
      entityType: "User",
      entityId: "user-1",
      actorId: "user-1",
    });

    expect(result).toBeNull();
  });

  it("finds audit logs with pagination", async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: "audit-1",
        action: "LOGIN",
        entityType: "User",
        entityId: "user-1",
        actorId: "user-1",
        createdAt: new Date(),
        actor: { id: "user-1", name: "Test User", email: "test@example.com", role: "MEMBER" },
      },
    ]);

    const result = await service.findAll(50);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    expect(result).toHaveLength(1);
  });

  it("defaults to 100 limit when not specified", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });
});