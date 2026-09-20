import { InvitationsService } from "./invitations.service";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { ConfigService } from "@nestjs/config";

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("hashed-password"),
  compare: jest.fn().mockResolvedValue(true),
}));

describe("InvitationsService (unit)", () => {
  let service: InvitationsService;
  let mockPrisma: any;
  let mockAuditService: any;
  let mockEmailQueue: any;
  let mockConfigService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPrisma = {
      invitation: {
        findFirst: jest.fn(),
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    mockAuditService = {
      log: jest.fn().mockResolvedValue(null),
    };

    mockEmailQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    mockConfigService = {
      get: jest.fn((key: string) => key === "NOTIFICATIONS_EMAIL_ENABLED" ? "true" : undefined),
    };

    service = new InvitationsService(
      mockPrisma as any,
      mockConfigService as any,
      mockAuditService as any,
      mockEmailQueue as any,
    );
  });

  describe("createInvitation", () => {
    it("should create invitation and queue email", async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: null,
        invitedById: "user-1",
        token: "mock-token",
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createInvitation("test@example.com", "MEMBER", undefined, "user-1");

      expect(result).toEqual({
        token: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      });
      expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: "test@example.com",
            role: "MEMBER",
            invitedById: "user-1",
            status: "PENDING",
          }),
        })
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith("send-email", expect.any(Object), expect.any(Object));
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INVITATION_CREATED",
          entityType: "Invitation",
        })
      );
    });

    it("should delete existing pending invitation for same email and create new one", async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue({ id: "existing-inv", email: "test@example.com", status: "PENDING" });
      mockPrisma.invitation.delete.mockResolvedValue({ id: "existing-inv" });
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: null,
        invitedById: "user-1",
        token: "mock-token",
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        status: "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createInvitation("test@example.com", "MEMBER", undefined, "user-1");

      expect(mockPrisma.invitation.delete).toHaveBeenCalledWith({ where: { id: "existing-inv" } });
      expect(mockPrisma.invitation.create).toHaveBeenCalled();
    });

    it("should include subsystemId when provided", async () => {
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-1",
        email: "test@example.com",
        role: "ADMIN",
        subsystemId: "sub-1",
        invitedById: "user-1",
        token: "mock-token",
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        status: "PENDING",
      });

      await service.createInvitation("test@example.com", "ADMIN", "sub-1", "user-1");

      expect(mockPrisma.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subsystemId: "sub-1",
            role: "ADMIN",
          }),
        })
      );
    });

    it("should not queue email if NOTIFICATIONS_EMAIL_ENABLED is not true", async () => {
      mockConfigService.get.mockReturnValue("false");
      mockPrisma.invitation.findFirst.mockResolvedValue(null);
      mockPrisma.invitation.create.mockResolvedValue({
        id: "inv-1",
        token: "mock-token",
        expiresAt: new Date(),
        status: "PENDING",
      });

      await service.createInvitation("test@example.com", "MEMBER", undefined, "user-1");

      expect(mockEmailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("validateToken", () => {
    it("should return invitation data for valid token", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "sub-1",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);

      const result = await service.validateToken("valid-token");

      expect(result).toEqual({
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "sub-1",
      });
    });

    it("should return null for non-existent token", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      const result = await service.validateToken("invalid-token");

      expect(result).toBeNull();
    });

    it("should return null and update status to EXPIRED if token expired", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: null,
        status: "PENDING",
        expiresAt: new Date(Date.now() - 1000),
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.invitation.update.mockResolvedValue({ ...mockInvitation, status: "EXPIRED" });

      const result = await service.validateToken("expired-token");

      expect(result).toBeNull();
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "EXPIRED" },
      });
    });

    it("should return null if invitation status is not PENDING", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: null,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);

      const result = await service.validateToken("accepted-token");

      expect(result).toBeNull();
    });
  });

  describe("acceptInvitation", () => {
    it("should accept valid invitation and create user", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: "sub-1",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      const mockUser = {
        id: "user-new",
        email: "test@example.com",
        name: "New User",
        passwordHash: "hashed-password",
        role: "MEMBER",
        subsystemId: "sub-1",
      };

      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.invitation.update.mockResolvedValue({ ...mockInvitation, status: "ACCEPTED" });
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await service.acceptInvitation("valid-token", "password123", "New User");

      expect(result).toEqual({ userId: "user-new" });
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: "test@example.com",
          name: "New User",
          passwordHash: "hashed-password",
          role: "MEMBER",
          subsystemId: "sub-1",
        }),
      });
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "ACCEPTED" },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INVITATION_ACCEPTED",
          entityType: "User",
        })
      );
    });

    it("should throw if invitation not found", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptInvitation("invalid-token", "password123", "New User")
      ).rejects.toThrow("Invalid or expired invitation");
    });

    it("should throw if invitation expired", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: null,
        status: "PENDING",
        expiresAt: new Date(Date.now() - 1000),
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.invitation.update.mockResolvedValue({ ...mockInvitation, status: "EXPIRED" });

      await expect(
        service.acceptInvitation("expired-token", "password123", "New User")
      ).rejects.toThrow("Invitation has expired");
    });

    it("should throw if invitation status is not PENDING", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        subsystemId: null,
        status: "ACCEPTED",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);

      await expect(
        service.acceptInvitation("accepted-token", "password123", "New User")
      ).rejects.toThrow("Invalid or expired invitation");
    });
  });

  describe("listPendingInvitations", () => {
    it("should return pending invitations with invitedBy and subsystem", async () => {
      const mockInvitations = [
        {
          id: "inv-1",
          email: "a@test.com",
          role: "MEMBER",
          invitedBy: { id: "user-1", name: "User One", email: "user1@test.com" },
          subsystem: { name: "Subsystem A" },
        },
        {
          id: "inv-2",
          email: "b@test.com",
          role: "ADMIN",
          invitedBy: { id: "user-2", name: "User Two", email: "user2@test.com" },
          subsystem: null,
        },
      ];
      mockPrisma.invitation.findMany.mockResolvedValue(mockInvitations);

      const result = await service.listPendingInvitations();

      expect(result).toEqual(mockInvitations);
      expect(mockPrisma.invitation.findMany).toHaveBeenCalledWith({
        where: { status: "PENDING" },
        include: {
          invitedBy: { select: { id: true, name: true, email: true } },
          subsystem: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    });
  });

  describe("revokeInvitation", () => {
    it("should revoke pending invitation", async () => {
      const mockInvitation = {
        id: "inv-1",
        email: "test@example.com",
        role: "MEMBER",
        status: "PENDING",
      };
      mockPrisma.invitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrisma.invitation.update.mockResolvedValue({ ...mockInvitation, status: "REVOKED" });

      const result = await service.revokeInvitation("inv-1", "actor-1");

      expect(result).toEqual({ revoked: true });
      expect(mockPrisma.invitation.update).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { status: "REVOKED" },
      });
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "INVITATION_REVOKED",
          entityType: "Invitation",
        })
      );
    });

    it("should throw if invitation not found", async () => {
      mockPrisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.revokeInvitation("non-existent", "actor-1")).rejects.toThrow("Invitation not found");
    });
  });
});