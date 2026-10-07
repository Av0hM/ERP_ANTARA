import { refreshDigest } from "../../common/sessions/session.service";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { ThrottlerStorageService } from "@nestjs/throttler";
import { PrismaClient } from "@prisma/client";
import { RefreshThrottleGuard, refreshLimits } from "./refresh-throttle.guard";

function context(refreshToken: unknown, forwarded = "ignored") {
  return new ExecutionContextHost([
    {
      body: { refreshToken },
      ip: "127.0.0.1",
      headers: { "x-forwarded-for": forwarded },
    },
    { setHeader: jest.fn() },
  ]);
}
describe("Refresh throttling", () => {
  const db = new PrismaClient({
    datasources: { db: { url: "postgresql://unused@127.0.0.1:1/unused" } },
  });
  let store: ThrottlerStorageService;
  let guard: RefreshThrottleGuard;
  beforeEach(() => {
    store = new ThrottlerStorageService();
    guard = new RefreshThrottleGuard(db, store);
    jest.spyOn(db.session, "findUnique").mockResolvedValue(null);
  });
  afterEach(() => {
    store.onApplicationShutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  afterAll(() => db.$disconnect());
  it("throttles one credential without putting it or its reusable digest in limiter state", async () => {
    const token = "a".repeat(64);
    for (let i = 0; i < refreshLimits.credential; i++)
      await guard.canActivate(context(token));
    await expect(guard.canActivate(context(token))).rejects.toMatchObject({
      status: 429,
    });
    const state = JSON.stringify([...store.storage]);
    expect(state).not.toContain(token);
    expect(state).not.toContain(refreshDigest(token));
    expect([...store.storage.keys()]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^refresh:credential:[a-f0-9]{64}$/),
      ]),
    );
  });
  it("different credentials have independent buckets behind one IP", async () => {
    for (let i = 0; i < 125; i++)
      await expect(
        guard.canActivate(context(i.toString(16).padStart(64, "0"))),
      ).resolves.toBe(true);
  });
  it("stable session bucket survives rotation", async () => {
    jest.spyOn(db.session, "findUnique").mockResolvedValue({
      id: "same-session",
      userId: "user",
      refreshTokenHash: null,
      userAgent: null,
      ipAddress: null,
      createdAt: new Date(),
      expiresAt: new Date(),
      revokedAt: null,
    });
    for (let i = 0; i < refreshLimits.session; i++)
      await guard.canActivate(context(i.toString(16).padStart(64, "0")));
    await expect(
      guard.canActivate(context("f".repeat(64))),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("bounds random-credential lookup floods per actual source IP", async () => {
    for (let i = 0; i < refreshLimits.source; i++)
      await guard.canActivate(context(i.toString(16).padStart(64, "0")));
    await expect(
      guard.canActivate(context("f".repeat(64))),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.session.findUnique).toHaveBeenCalledTimes(refreshLimits.source);
  });
  it("malformed credentials share a source bucket and forwarded headers cannot evade it", async () => {
    for (let i = 0; i < refreshLimits.credential; i++)
      await guard.canActivate(context(`invalid-${i}`, `attacker-${i}`));
    await expect(
      guard.canActivate(context({}, "new-forwarded-ip")),
    ).rejects.toMatchObject({ status: 429 });
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });
  it("buckets recover after the limit window", async () => {
    jest.useFakeTimers();
    for (let i = 0; i < refreshLimits.credential; i++)
      await guard.canActivate(context("a".repeat(64)));
    await expect(
      guard.canActivate(context("a".repeat(64))),
    ).rejects.toMatchObject({ status: 429 });
    jest.advanceTimersByTime(refreshLimits.ttl + 1);
    await expect(guard.canActivate(context("a".repeat(64)))).resolves.toBe(
      true,
    );
  });
});
