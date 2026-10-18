import { Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host";
import { IdentityThrottleStorage } from "./identity-throttle.storage";
import { GoogleIdentityService } from "./google-identity.service";
import { IdentityThrottleGuard } from "./identity-throttle.guard";
import { refreshLimits } from "./refresh-throttle.guard";

function context(
  body: unknown,
  google = true,
  forwarded = "ignored",
  source = "127.0.0.1",
) {
  return new ExecutionContextHost(
    [
      {
        body,
        socket: { remoteAddress: source },
        headers: { "x-forwarded-for": forwarded },
      },
      { setHeader: jest.fn() },
    ],
    class Fixture {},
    google ? function googleCallback() {} : function login() {},
  );
}
describe("Identity throttling behind shared NextAuth egress", () => {
  let store: IdentityThrottleStorage;
  let guard: IdentityThrottleGuard;
  const google = new GoogleIdentityService(new ConfigService());
  beforeEach(() => {
    store = new IdentityThrottleStorage();
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
  it("same identity shares its budget across IPv4, IPv6 and browser cookies", async () => {
    for (let i = 0; i < 20; i++) {
      const ctx = context(
        { idToken: `alice:${i}` },
        true,
        `forged-${i}`,
        i % 2 ? "::1" : "192.0.2.1",
      );
      ctx.switchToHttp().getRequest().headers.cookie = `browser=${i}`;
      await guard.canActivate(ctx);
    }
    await expect(
      guard.canActivate(
        context({ idToken: "alice:last" }, true, "new", "2001:db8::2"),
      ),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("concurrent requests after 19 hits admit exactly one", async () => {
    for (let i = 0; i < 19; i++)
      await guard.canActivate(context({ idToken: `alice:${i}` }));
    const outcomes = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        guard.canActivate(context({ idToken: `alice:race${i}` })),
      ),
    );
    expect(
      outcomes.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    for (const result of outcomes)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ status: 429 });
  });
  it("blocks for exactly 60s from the rejected request, not first/last request; Retry-After rounds up", async () => {
    jest.useFakeTimers();
    for (let i = 0; i < 20; i++)
      await guard.canActivate(context({ idToken: `alice:${i}` }));
    jest.advanceTimersByTime(10000);
    const blocked = context({ idToken: "alice:21" });
    await expect(guard.canActivate(blocked)).rejects.toMatchObject({
      status: 429,
    });
    expect(blocked.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      "Retry-After",
      60,
    );
    jest.advanceTimersByTime(50000); // Original hits have expired, but block has not.
    const retry = context({ idToken: "alice:22" });
    await expect(guard.canActivate(retry)).rejects.toMatchObject({
      status: 429,
    });
    expect(retry.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      "Retry-After",
      10,
    );
    jest.advanceTimersByTime(9999);
    const last = context({ idToken: "alice:23" });
    await expect(guard.canActivate(last)).rejects.toMatchObject({
      status: 429,
    });
    expect(last.switchToHttp().getResponse().setHeader).toHaveBeenCalledWith(
      "Retry-After",
      1,
    );
    jest.advanceTimersByTime(1);
    await expect(
      guard.canActivate(context({ idToken: "alice:24" })),
    ).resolves.toBe(true);
  });
  it("without a violation, individual hits expire 60s after their own arrival", async () => {
    jest.useFakeTimers();
    await guard.canActivate(context({ idToken: "alice:0" }));
    jest.advanceTimersByTime(10000);
    for (let i = 1; i < 20; i++)
      await guard.canActivate(context({ idToken: `alice:${i}` }));
    jest.advanceTimersByTime(50000);
    await expect(
      guard.canActivate(context({ idToken: "alice:20" })),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ idToken: "alice:21" })),
    ).rejects.toMatchObject({ status: 429 });
  });
  it("random invalid email identifiers only create source/malformed keys", async () => {
    for (let i = 0; i < 20; i++)
      await guard.canActivate(context({ email: `invalid-${i}` }, false));
    await expect(
      guard.canActivate(context({ email: "another-invalid" }, false)),
    ).rejects.toMatchObject({ status: 429 });
    expect(store.storage.size).toBe(2);
    await expect(
      guard.canActivate(context({ email: "valid@fixture.invalid" }, false)),
    ).resolves.toBe(true);
  });
  it("lost-response retry of the same Google token is allowed, but repetition is bounded and temporary", async () => {
    jest.useFakeTimers();
    for (let i = 0; i < 20; i++)
      await expect(
        guard.canActivate(context({ idToken: "alice:unchanged" })),
      ).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ idToken: "alice:unchanged" })),
    ).rejects.toMatchObject({ status: 429 });
    jest.advanceTimersByTime(60000);
    await expect(
      guard.canActivate(context({ idToken: "alice:unchanged" })),
    ).resolves.toBe(true);
  });
  it("restarting or using another instance resets budgets (explicit single-instance limitation)", async () => {
    for (let i = 0; i < 20; i++)
      await guard.canActivate(context({ idToken: "alice:token" }));
    await expect(
      guard.canActivate(context({ idToken: "alice:token" })),
    ).rejects.toMatchObject({ status: 429 });
    const otherStore = new IdentityThrottleStorage();
    try {
      await expect(
        new IdentityThrottleGuard(google, otherStore).canActivate(
          context({ idToken: "alice:token" }),
        ),
      ).resolves.toBe(true);
    } finally {
      otherStore.onApplicationShutdown();
    }
  });
});
