import { backendSignIn } from "../../../../web/src/lib/backend-sign-in";
import { INestApplication, Logger, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { GoogleIdentityService } from "./google-identity.service";
import { IdentityThrottleGuard } from "./identity-throttle.guard";
import { IdentityThrottleStorage } from "./identity-throttle.storage";
import { RefreshThrottleGuard } from "./refresh-throttle.guard";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

describe("Actual auth route identity throttling over HTTP", () => {
  let app: INestApplication;
  let origin: string;
  beforeAll(async () => {
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 20 }])],
      controllers: [AuthController],
      providers: [
        IdentityThrottleGuard,
        IdentityThrottleStorage,
        {
          provide: AuthService,
          useValue: {
            login: async () => ({ ok: true }),
            googleCallback: async () => ({
              user: {
                id: "db-id",
                email: "fixture@example.invalid",
                name: "Fixture",
                role: "MEMBER",
              },
              accessToken: "access",
              refreshToken: "refresh",
              accessTokenExpiresAt: "2030-01-01T00:00:00.000Z",
            }),
          },
        },
        {
          provide: GoogleIdentityService,
          useValue: {
            verify: async (token: string) => ({
              email: `${token.split(":")[0]}@fixture.invalid`,
            }),
          },
        },
      ],
    })
      .overrideGuard(RefreshThrottleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });
  afterAll(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });
  const post = (route: string, body: object) =>
    fetch(`${origin}/api/auth/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "forged",
      },
      body: JSON.stringify(body),
    });
  it("fresh Google sign-in succeeds after a 90s identity block, with one exchange and no cooldown redirect", async () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const login = (attempt: number) =>
      backendSignIn(
        `${origin}/api`,
        { id: "google-id" },
        {
          provider: "google",
          providerAccountId: "fixture",
          type: "oidc",
          id_token: `recovery:${attempt}`,
        },
      );
    try {
      for (let i = 0; i < 20; i++) expect(await login(i)).toBe(true);
      expect(await login(20)).toBe(
        `/login/rate-limited?retryAt=${now + 60000}`,
      );
      expect(Logger.prototype.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "identity",
          operation: "googleCallback",
        }),
      );
      clock.mockReturnValue(now + 59000);
      expect(await login(21)).toBe(
        `/login/rate-limited?retryAt=${now + 60000}`,
      );
      clock.mockReturnValue(now + 90000);
      fetchSpy.mockClear();
      expect(await login(22)).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
      clock.mockRestore();
    }
  });
  it.each(["google-callback", "login"])(
    "%s isolates real controller budgets behind one source",
    async (route) => {
      const body = (id: string, attempt: number) =>
        route === "login"
          ? { email: `${id}@fixture.invalid`, password: "fixture-password" }
          : { idToken: `${id}:${attempt}` };
      for (let i = 0; i < 20; i++)
        expect((await post(route, body("alice", i))).status).toBe(201);
      const limited = await post(route, body("alice", 21));
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toBeTruthy();
      for (let i = 0; i < 50; i++)
        expect((await post(route, body(`independent${i}`, 0))).status).toBe(
          201,
        );
    },
  );
});
