import {
  Controller,
  Get,
  Post,
  UseGuards,
  INestApplication,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { Request, Response } from "express";
import { SessionService } from "../sessions/session.service";
import { JwtStrategy } from "../../modules/auth/strategies/jwt.strategy";
import { JwtAuthGuard } from "../../modules/auth/guards/jwt-auth.guard";
import {
  ApplicationRateLimitInterceptor,
  RateLimitingMiddleware,
  applicationRateLimits,
  limitVerifiedApplicationRequest,
} from "./rate-limiting.middleware";

@Controller()
class FixtureController {
  @Get("normal") @UseGuards(JwtAuthGuard) normal() {
    return { ok: true };
  }
  @Post("normal") @UseGuards(JwtAuthGuard) mutation() {
    return { ok: true };
  }
  @Get("public") public() {
    return { ok: true };
  }
  @Get("health") health() {
    return { ok: true };
  }
}

describe("shared-source application limiter: real Passport JWT + current session boundary", () => {
  let app: INestApplication;
  let limiter: RateLimitingMiddleware;
  let origin: string;
  const jwt = new JwtService();
  const secret = "isolated-rate-limit-fixture-only";
  const sessions = new Map<
    string,
    {
      userId: string;
      revokedAt: Date | null;
      expiresAt: Date;
      user: {
        id: string;
        name: string;
        email: string;
        role: "MEMBER";
        isActive: boolean;
        deletedAt: Date | null;
        isDummySeed: boolean;
      };
    }
  >();
  const findUnique = jest.fn(
    async ({ where }: { where: { id: string } }) =>
      sessions.get(where.id) ?? null,
  );
  async function token(userId: string, sid = `${userId}-session`) {
    sessions.set(sid, {
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 3600000),
      user: {
        id: userId,
        name: "Fixture",
        email: "fixture@invalid.test",
        role: "MEMBER",
        isActive: true,
        deletedAt: null,
        isDummySeed: false,
      },
    });
    return jwt.signAsync({ id: userId, sid }, { secret, expiresIn: "15m" });
  }
  async function start(config: Record<string, number> = {}) {
    const sessionService = new SessionService(
      { session: { findUnique } } as unknown as PrismaClient,
      jwt,
      new ConfigService(),
    );
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
      providers: [
        JwtStrategy,
        { provide: SessionService, useValue: sessionService },
        {
          provide: ConfigService,
          useValue: new ConfigService({ auth: { accessSecret: secret } }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    limiter = new RateLimitingMiddleware(new ConfigService(config));
    app.use(limiter.use.bind(limiter));
    app.useGlobalInterceptors(new ApplicationRateLimitInterceptor());
    await app.listen(0, "127.0.0.1");
    origin = `${await app.getUrl()}/api`;
  }
  const get = (
    access?: string,
    route = "normal",
    headers: Record<string, string> = {},
  ) =>
    fetch(`${origin}/${route}`, {
      headers: {
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...headers,
      },
    });
  afterEach(async () => {
    limiter?.onModuleDestroy();
    await app?.close();
    sessions.clear();
    findUnique.mockClear();
    jest.restoreAllMocks();
  });

  it("separates users at one source and keeps a finite per-account limit across sessions", async () => {
    await start({ API_RATE_LIMIT_USER_MAX: 2 });
    const a = await token("a"),
      b = await token("b"),
      device = await token("a", "device-2");
    expect((await get(a)).status).toBe(200);
    expect((await get(device)).status).toBe(200);
    const denied = await get(a);
    expect(denied.status).toBe(429);
    expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await denied.json()).toEqual({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Too many requests, please try again later.",
      retryAfter: expect.any(Number),
    });
    expect((await get(b)).status).toBe(200);
  });
  it("many verified users share only the finite coarse ceiling", async () => {
    await start({ API_RATE_LIMIT_SOURCE_FLOOD_MAX: 60 });
    for (let i = 0; i < 30; i++) {
      const access = await token(`u${i}`);
      expect((await get(access)).status).toBe(200);
      expect((await get(access)).status).toBe(200);
    }
    expect((await get(await token("next"))).status).toBe(429);
  });
  it("does not accept body/query/header/cookie IDs or forwarded addresses as identity", async () => {
    await start({ API_RATE_LIMIT_USER_MAX: 1 });
    const access = await token("verified");
    expect((await get(access)).status).toBe(200);
    const response = await fetch(`${origin}/normal?userId=other`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        "X-User-ID": "other",
        "X-Forwarded-For": "192.0.2.1",
        "X-Real-IP": "192.0.2.2",
        Forwarded: "for=192.0.2.3",
        Cookie: "userId=other",
      },
      body: JSON.stringify({ userId: "other", actorId: "other" }),
    });
    expect(response.status).toBe(429);
  });
  it.each(["X-Forwarded-For", "X-Real-IP", "Forwarded", "CF-Connecting-IP"])(
    "ignores %s for public source budgets",
    async (header) => {
      await start({ API_RATE_LIMIT_PUBLIC_SOURCE_MAX: 1 });
      expect(
        (await get(undefined, "public", { [header]: "192.0.2.1" })).status,
      ).toBe(200);
      expect(
        (await get(undefined, "public", { [header]: "192.0.2.2" })).status,
      ).toBe(429);
    },
  );
  it.each([
    "malformed",
    "unsigned",
    "expired",
    "unknown",
    "revoked",
    "inactive",
    "deleted",
  ])("%s credentials cannot gain user budgets", async (kind) => {
    await start({ API_RATE_LIMIT_PUBLIC_SOURCE_MAX: 1 });
    let access = await token("a");
    const session = sessions.get("a-session")!;
    if (kind === "malformed") access = "broken";
    if (kind === "unsigned")
      access = await jwt.signAsync(
        { id: "a", sid: "a-session" },
        { secret: "wrong" },
      );
    if (kind === "expired")
      access = await jwt.signAsync(
        { id: "a", sid: "a-session" },
        { secret, expiresIn: -1 },
      );
    if (kind === "unknown") sessions.clear();
    if (kind === "revoked") session.revokedAt = new Date();
    if (kind === "inactive") session.user.isActive = false;
    if (kind === "deleted") session.user.deletedAt = new Date();
    expect((await get(access)).status).toBe(401);
    expect((await get("different-invalid-token")).status).toBe(429);
    expect((await get(await token("other"))).status).toBe(200);
  });
  it("session revocation takes effect on the next request despite prior verified identity", async () => {
    await start({ API_RATE_LIMIT_PUBLIC_SOURCE_MAX: 1 });
    const access = await token("a");
    expect((await get(access)).status).toBe(200);
    sessions.get("a-session")!.revokedAt = new Date();
    expect((await get(access)).status).toBe(401);
    expect((await get(access)).status).toBe(429);
  });
  it("health stays exempt even after both ordinary budgets are exhausted", async () => {
    await start({ API_RATE_LIMIT_SOURCE_FLOOD_MAX: 1 });
    expect((await get(undefined, "public")).status).toBe(200);
    expect((await get(undefined, "public")).status).toBe(429);
    for (let i = 0; i < 5; i++)
      expect((await get(undefined, "health")).status).toBe(200);
  });
  it("counter expiry restores availability", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    await start({ API_RATE_LIMIT_USER_MAX: 1 });
    const access = await token("a");
    expect((await get(access)).status).toBe(200);
    expect((await get(access)).status).toBe(429);
    clock.mockReturnValue(now + 60_001);
    expect((await get(access)).status).toBe(200);
  });
});

describe("deterministic capacity and opaque bounded state", () => {
  function request(source = "127.0.0.1") {
    return {
      method: "GET",
      path: "/api/tasks",
      socket: { remoteAddress: source },
    } as Request;
  }
  const response = () =>
    ({
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }) as unknown as Response;
  it("supports a busy shell minute for 20 concurrent users, without auth bucket consumption", () => {
    // Initial shell/dashboard 12; periodic context/notifications/history 6;
    // two context switches 12; three focus bursts 18; navigation/mutations 24;
    // one pending AI job polling every 5 seconds 12. Total 84, < half of 180.
    const pattern = [12, 6, 12, 18, 24, 12];
    expect(pattern.reduce((a, b) => a + b, 0)).toBe(84);
    const limiter = new RateLimitingMiddleware(new ConfigService());
    try {
      for (let user = 0; user < 20; user++)
        for (const burst of pattern)
          for (let i = 0; i < burst; i++) {
            const req = request(),
              res = response(),
              next = jest.fn();
            limiter.use(req, res, next);
            expect(next).toHaveBeenCalledTimes(1);
            expect(() =>
              limitVerifiedApplicationRequest(req, `verified-${user}`),
            ).not.toThrow();
          }
      expect(applicationRateLimits.sourceFlood).toBe(
        20 * applicationRateLimits.user,
      );
      const keys = [...limiter["store"].keys()];
      expect(keys).toHaveLength(21);
      expect(
        keys.every((key) => /^(source|user):[a-f0-9]{64}$/.test(key)),
      ).toBe(true);
      expect(JSON.stringify(keys)).not.toMatch(
        /127\.0\.0\.1|verified-|Bearer|@/,
      );
    } finally {
      limiter.onModuleDestroy();
    }
  });
  it("saturating state fails closed rather than evicting live budgets", () => {
    const limiter = new RateLimitingMiddleware(new ConfigService());
    try {
      for (let i = 0; i < applicationRateLimits.maxKeys; i++)
        limiter["store"].set(`fixture-${i}`, {
          count: 1,
          resetTime: Date.now() + 60000,
        });
      const res = response(),
        next = jest.fn();
      limiter.use(request(), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 60);
    } finally {
      limiter.onModuleDestroy();
    }
  });
  it.each([
    "/api/auth/login",
    "/api/auth/google-callback",
    "/api/auth/refresh",
    "/api/invitations/accept",
  ])("leaves %s entirely to its specialized guards", (path) => {
    const limiter = new RateLimitingMiddleware(new ConfigService());
    try {
      const req = request();
      req.method = "POST";
      Object.defineProperty(req, "path", { value: path });
      limiter.use(req, response(), jest.fn());
      limitVerifiedApplicationRequest(req);
      expect(limiter["store"].size).toBe(0);
    } finally {
      limiter.onModuleDestroy();
    }
  });
});
