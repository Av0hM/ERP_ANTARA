import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcryptjs";
import { AppRole } from "@antara/contracts";

import { AuthService } from "./auth.service";

jest.mock("bcryptjs", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

describe("AuthService", () => {
  const usersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
  };

  const prisma = {
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const jwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === "auth.accessSecret") return "access-secret";
      if (key === "auth.refreshSecret") return "refresh-secret";
      if (key === "auth.allowJsonCredentials") return "true";
      return undefined;
    }),
  } as unknown as ConfigService;

  const auditService = {
    log: jest.fn().mockResolvedValue(null),
  };

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(
      usersService as never,
      prisma as never,
      jwtService,
      configService,
      auditService as never,
    );
  });

  it("registers a new user and creates a session", async () => {
    usersService.findByEmail.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");
    usersService.create.mockResolvedValue({
      id: "user-1",
      email: "owner@antara.club",
      name: "Mission Director",
      role: AppRole.OWNER,
    });
    (jwtService.signAsync as jest.Mock)
      .mockResolvedValueOnce("access-token")
      .mockResolvedValueOnce("refresh-token");
    prisma.session.create.mockResolvedValue({});

    const result = await service.register({
      email: "owner@antara.club",
      name: "Mission Director",
      password: "antara123erp",
      role: AppRole.OWNER,
    });

    expect(result.user.email).toBe("owner@antara.club");
    expect(result.accessToken).toBe("access-token");
    expect(result.refreshToken).toBe("refresh-token");
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it("rejects invalid login credentials", async () => {
    usersService.findByEmail.mockResolvedValue({
      passwordHash: "stored-hash",
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        email: "owner@antara.club",
        password: "wrongpass123",
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("authenticates a demo user from the JSON fixture when enabled", async () => {
    usersService.findByEmail.mockResolvedValue(null);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login({
      email: "member@orbitalops.club",
      password: "Member!2026",
    });

    expect(result.user.email).toBe("member@orbitalops.club");
    expect(result.user.role).toBe(AppRole.MEMBER);
    expect(prisma.session.create).toHaveBeenCalled();
  });

  it("refreshes a valid session", async () => {
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-1",
      type: "refresh",
    });
    prisma.session.findUnique.mockResolvedValue({
      id: "session-1",
      refreshToken: "old-refresh",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: "user-1",
        email: "owner@antara.club",
        name: "Mission Director",
        role: AppRole.OWNER,
      },
    });
    (jwtService.signAsync as jest.Mock)
      .mockResolvedValueOnce("new-access-token")
      .mockResolvedValueOnce("new-refresh-token");
    prisma.session.update.mockResolvedValue({});

    const result = await service.refreshSession({ refreshToken: "old-refresh" });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("new-refresh-token");
    expect(prisma.session.update).toHaveBeenCalled();
  });
});

