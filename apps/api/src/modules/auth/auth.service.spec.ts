import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaClient } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { RegisterDto } from "./dto/register.dto";
import { GoogleCallbackDto } from "./dto/google-callback.dto";
import { GoogleIdentityService } from "./google-identity.service";
import {
  SessionService,
  refreshDigest,
  accountCanAuthenticate,
} from "../../common/sessions/session.service";

describe("Auth contract safety", () => {
  const db = new PrismaClient({
    datasources: { db: { url: "postgresql://unused@127.0.0.1:1/unused" } },
  });
  const config = new ConfigService();
  const google = new GoogleIdentityService(config);
  const sessions = new SessionService(db, new JwtService(), config);
  const service = new AuthService(db, sessions, config, google);
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => db.$disconnect());
  it.each(["OWNER", "ADMIN", "MEMBER"])(
    "public registration rejects %s and creates no user",
    async (role) => {
      const create = jest.spyOn(db.user, "create");
      const dto = plainToInstance(RegisterDto, {
        email: "user@fixture.invalid",
        name: "User",
        password: "fixture-password",
        role,
      });
      expect(
        (
          await validate(dto, { whitelist: true, forbidNonWhitelisted: true })
        ).some((error) => error.property === "role"),
      ).toBe(true);
      expect(() => new AuthController(service).register()).toThrow(
        "Registration requires an invitation",
      );
      expect(create).not.toHaveBeenCalled();
    },
  );
  it("rejects public registration without a role too", () =>
    expect(() => service.register()).toThrow(
      "Registration requires an invitation",
    ));
  it("rejects plain-email Google callback DTO", async () => {
    const errors = await validate(
      plainToInstance(GoogleCallbackDto, {
        email: "owner@fixture.invalid",
        name: "Owner",
      }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining(["email", "name", "idToken"]),
    );
  });
  it("rejects invalid Google verification before database access", async () => {
    jest
      .spyOn(google, "verify")
      .mockRejectedValue(new Error("Invalid Google token"));
    const create = jest.spyOn(db.user, "upsert");
    await expect(service.googleCallback({ idToken: "fake" })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
  it("empty backend allowlist denies even a verified identity", async () => {
    jest.spyOn(google, "verify").mockResolvedValue({
      email: "owner@fixture.invalid",
      name: "Owner",
      avatarUrl: undefined,
    });
    await expect(
      service.googleCallback({ idToken: "verified-fixture" }),
    ).rejects.toThrow("Authentication failed");
  });
  it("missing credentials user is rejected without creating a session", async () => {
    jest.spyOn(db.user, "findUnique").mockResolvedValue(null);
    const issue = jest.spyOn(sessions, "issue");
    await expect(
      service.login({
        email: "missing@fixture.invalid",
        password: "incorrect",
      }),
    ).rejects.toThrow("Invalid credentials");
    expect(issue).not.toHaveBeenCalled();
  });
  it("digests high entropy credentials deterministically, without storing usable plaintext", () => {
    expect(refreshDigest("fixture")).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshDigest("fixture")).toBe(refreshDigest("fixture"));
    expect(refreshDigest("fixture")).not.toBe(refreshDigest("different"));
  });
  it("dummy seeded accounts cannot authenticate in production even with allowlist flag", () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      expect(
        accountCanAuthenticate({
          isActive: true,
          deletedAt: null,
          isDummySeed: true,
        }),
      ).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
