vi.mock("bcryptjs", () => ({
  hash: vi.fn().mockResolvedValue("hashed-password"),
  compare: vi.fn().mockResolvedValue(true),
}));

import { describe, it, expect, beforeEach, vi, Mock } from "vitest";
import { InvitationsService } from "./invitations.service";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

describe("InvitationsService (unit)", () => {
  let service: InvitationsService;
  let mockPrisma: { invitation: Mock; user: Mock };
  let mockAuditService: { log: Mock };
  let mockEmailQueue: { add: Mock };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      invitation: {
        findFirst: vi.fn(),
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        findMany: vi.fn(),
      },
      user: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
    } as any;

    mockAuditService = {
      log: vi.fn().mockResolvedValue(null),
    } as any;

    mockEmailQueue = {
      add: vi.fn().mockResolvedValue(undefined),
    } as unknown as Queue;

    service = new InvitationsService(
      mockPrisma as any,
      { get: vi.fn((key: string) => key === "NOTIFICATIONS_EMAIL_ENABLED" ? "true" : undefined) } as any,
      mockAuditService as any,
      mockEmailQueue,
    );
  });

  describe("createInvitation", () => {
    it("should create invitation and queue email", async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
        invitedById: "user-1",
        token: "test-token",
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        status: "PENDING",
      });

      const result = await service.createInvitation("test@example.com", "MEMBER", "software", "user-1");

      expect(mockPrisma.invitation.findFirst).toHaveBeenCalledWith({
        where: { email: "test@example.com", status: "PENDING" },
      });
      expect(mockPrisma.invitation.create).toHaveBeenCalled();
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        "send-email",
        expect.objectContaining({
          email: "test@example.com",
          role: "MEMBER",
          subsystemId: "software",
        }),
        expect.objectContaining({
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        })
      );
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it("should delete existing pending invitation before creating new one", async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue({
        id: "existing-inv",
        email: "test@example.com",
        status: "PENDING",
      });
      mockPrisma.invitation.delete.mockResolvedValue({});
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-2",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
        invitedById: "user-1",
        token: "new-token",
        expiresAt: new Date(),
        status: "PENDING",
      });

      const result = await service.createInvitation("test@example.com", "MEMBER", "software", "user-1");

      expect(mockPrisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "existing-inv" } });
    });

    it("should not queue email when email is disabled", async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
        invitedById: "user-1",
        token: "test-token",
        expiresAt: new Date(),
        status: "PENDING",
      });

      const disabledService = new InvitationsService(
        mockPrisma as any,
        { get: vi.fn((key: string) => key === "NOTIFICATIONS_EMAIL_ENABLED" ? "false" : undefined) } as any,
        mockAuditService,
        mockEmailQueue,
      );

      const result = await disabledService.createInvitation("test@example.com", "MEMBER", "software", "user-1");

      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("validateToken", () => {
    it("should return invitation data for valid token", async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now

      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
        status: "PENDING",
        expiresAt,
      });

      const result = await service.validateToken("valid-token");

      expect(result).toEqual({
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
      });
    });

    it("should return null for invalid token", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      const result = await service.validateToken("invalid-token");

      expect(result).toBeNull();
    });

    it("should return null and mark expired for expired token", async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);

      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
        status: "PENDING",
        expiresAt: past,
      });
      mockPrisma.invitation.update.mockResolvedValue({});

      const result = await service.validateToken("expired-token");

      expect(result).toBeNull();
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "EXPIRED" },
      });
    });
  });

  describe("acceptInvitation", () => {
    it("should accept invitation and create user", async () => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);

      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "software",
        status: "PENDING",
        expiresAt,
      });
      mockPrisma.user.create.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        name: "Test User",
        role: "MEMBER",
        subsystemId: "software",
      });
      mockPrisma.invitation.update.mockResolvedValue({});

      const result = await service.acceptInvitation("valid-token", "password123", "Test User");

      expect(result).toEqual({ userId: "user-1" });
      expect(mockPrisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          email: "test@example.com",
          name: "Test User",
          role: "MEMBER",
          subsystemId: "software",
        }),
      }));
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "ACCEPTED" },
      });
    });

    it("should throw for invalid token", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation("invalid-token", "password123", "Test User"))
        .rejects.toThrow("Invalid or expired invitation");
    });

    it("should throw for expired token", async () => {
      const past = new Date(Date.now() - 60 * 60 * 1000);

      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        status: "PENDING",
        expiresAt: past,
      });
      mockPrisma.invitation.update.mockResolvedValue({});

      await expect(service.acceptInvitation("expired-token", "password123", "Test User"))
        .rejects.toThrow("Invitation has expired");
    });
  });

  describe("revokeInvitation", () => {
    it("should revoke invitation and log audit", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
      });
      mockPrisma.invitation.update.mockResolvedValue({});

      const result = await service.revokeInvitation("inv-1", "admin-1");

      expect(result).toEqual({ revoked: true });
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "REVOKED" },
      });
    });

    it("should throw for non-existent invitation", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.revokeInvitation("non-existent", "admin-1"))
        .rejects.toThrow("Invitation not found");
    });
  });
});