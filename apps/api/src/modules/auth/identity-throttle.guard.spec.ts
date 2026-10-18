import { Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { ThrottlerStorageService } from "@nestjs/throttler";
import { GoogleIdentityService } from "./google-identity.service";
import { IdentityThrottleGuard } from "./identity-throttle.guard";
import { refreshLimits } from "./refresh-throttle.guard";

function context(body: unknown, google = true, forwarded = "ignored") {
  return new ExecutionContextHost(
    [
      {
        body,
        socket: { remoteAddress: "127.0.0.1" },
        headers: { "x-forwarded-for": forwarded },
      },
      { setHeader: jest.fn() },
    ],
    class Fixture {},
    google ? function googleCallback() {} : function login() {},
  );
}
describe("Identity throttling behind shared NextAuth egress", () => {
  let store: ThrottlerStorageService;
  let guard: IdentityThrottleGuard;
  const google = new GoogleIdentityService(new ConfigService());
  beforeEach(() => {
    store = new ThrottlerStorageService();
    guard = new IdentityThrottleGuard(google, store);
    jest.spyOn(google, "verify").mockImplementation(async (token) => ({
      email: `${token.split(":")[0]}@fixture.invalid`,
      name: "Fixture",
      avatarUrl: undefined,
    }));
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => {
    store.onApplicationShutdown();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  it("one Google identity cannot exhaust another behind the same proxy, even with rotated tokens", async () => {
    for (let i = 0; i < 20; i++)
      await guard.canActivate(context({ idToken: `alice:${i}` }));
    await expect(
      guard.canActivate(context({ idToken: "alice:new" })),
    ).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 30; i++)
      await expect(
        guard.canActivate(context({ idToken: `user${i}:token` })),
      ).resolves.toBe(true);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "googleCallback",
        bucket: "identity",
        event: "auth_rate_limited",
      }),
    );
    const state = JSON.stringify([...store.storage]);
    const logs = JSON.stringify(jest.mocked(Logger.prototype.warn).mock.calls);
    for (const value of ["alice", "@fixture.invalid", "127.0.0.1"]) {
      expect(state).not.toContain(value);
      expect(logs).not.toContain(value);
    }
  });
  it("password attempts are normalized per account, not per forwarded or proxy IP", async () => {
    for (let i = 0; i < 20; i++)
      await guard.canActivate(
        context({ email: " Alice@fixture.invalid " }, false, String(i)),
      );
    await expect(
      guard.canActivate(context({ email: "alice@fixture.invalid" }, false)),
    ).rejects.toMatchObject({ status: 429 });
    await expect(
      guard.canActivate(context({ email: "bob@fixture.invalid" }, false)),
    ).resolves.toBe(true);
  });
  it("does not trust forged Google claims and bounds replay before verification", async () => {
    jest.mocked(google.verify).mockRejectedValue(new UnauthorizedException());
    for (let i = 0; i < 20; i++)
      await expect(
        guard.canActivate(context({ idToken: "forged" })),
      ).rejects.toMatchObject({ status: 401 });
    await expect(
      guard.canActivate(context({ idToken: "forged" })),
    ).rejects.toMatchObject({ status: 429 });
    expect(google.verify).toHaveBeenCalledTimes(20);
    expect(
      [...store.storage.keys()].some((key) => key.includes(":identity:")),
    ).toBe(false);
  });
  it("malformed source quota cannot block a valid Google identity", async () => {
    for (let i = 0; i < 20; i++) await guard.canActivate(context({}));
    await expect(guard.canActivate(context({}))).rejects.toMatchObject({
      status: 429,
    });
    await expect(
      guard.canActivate(context({ idToken: "bob:token" })),
    ).resolves.toBe(true);
  });
  it("retains a bounded source flood ceiling despite forged forwarding headers", async () => {
    for (let i = 0; i < refreshLimits.source; i++)
      await guard.canActivate(
        context({ email: `user${i}@fixture.invalid` }, false, String(i)),
      );
    await expect(
      guard.canActivate(
        context({ email: "new@fixture.invalid" }, false, "different"),
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("recovers after the window expires", async () => {
    jest.useFakeTimers();
    for (let i = 0; i < 20; i++)
      await guard.canActivate(context({ idToken: "alice:token" }));
    await expect(
      guard.canActivate(context({ idToken: "alice:token" })),
    ).rejects.toMatchObject({ status: 429 });
    jest.advanceTimersByTime(60001);
    await expect(
      guard.canActivate(context({ idToken: "alice:token" })),
    ).resolves.toBe(true);
  });
});
