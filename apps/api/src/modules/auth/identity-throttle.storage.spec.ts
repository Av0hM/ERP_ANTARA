import {
  IdentityThrottleStorage,
  identityMaxKeys,
} from "./identity-throttle.storage";

describe("bounded identity throttle storage", () => {
  let store: IdentityThrottleStorage;
  beforeEach(() => {
    jest.useFakeTimers();
    store = new IdentityThrottleStorage();
  });
  afterEach(() => {
    store.onApplicationShutdown();
    jest.useRealTimers();
  });
  const consume = (store: IdentityThrottleStorage, key: string) =>
    store.increment(key, 60000, 20, 60000, "identity");
  it.each([60000, 90000])(
    "admits the same key after %i ms without extending blocks",
    async (elapsed) => {
      for (let i = 1; i <= 20; i++)
        expect(await consume(store, "identity")).toMatchObject({
          totalHits: i,
          isBlocked: false,
        });
      expect(await consume(store, "identity")).toMatchObject({
        isBlocked: true,
        timeToBlockExpire: 60,
      });
      const deadline = store.storage.get("identity")!.blockExpiresAt;
      jest.advanceTimersByTime(59000);
      expect(await consume(store, "identity")).toMatchObject({
        isBlocked: true,
        timeToBlockExpire: 1,
      });
      expect(store.storage.get("identity")!.blockExpiresAt).toBe(deadline);
      jest.advanceTimersByTime(elapsed - 59000);
      expect(await consume(store, "identity")).toMatchObject({
        totalHits: 1,
        isBlocked: false,
      });
      expect(await consume(store, "identity")).toMatchObject({
        totalHits: 2,
        isBlocked: false,
      });
    },
  );
  it("caps concurrent new-key admission without evicting existing budgets", async () => {
    // Capacity fixture without allocating 50,000 timers. Admission uses the real Map.
    for (let i = 0; i < identityMaxKeys - 1; i++)
      store.storage.set(`existing-${i}`, {
        totalHits: new Map([["identity", 0]]),
        expiresAt: Date.now() + 60000,
        blockExpiresAt: 0,
        isBlocked: false,
      });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => consume(store, `new-${i}`)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ status: 503 });
    expect(store.storage.size).toBe(identityMaxKeys);
    await expect(consume(store, "existing-0")).resolves.toMatchObject({
      totalHits: 1,
    });
    jest.advanceTimersByTime(120000);
    expect(store.storage.size).toBe(0);
    await expect(consume(store, "after-cleanup")).resolves.toMatchObject({
      totalHits: 1,
    });
  });
  it("expires hits and sweeps idle keys instead of retaining identifiers forever", async () => {
    await consume(store, "idle");
    for (let i = 0; i < 21; i++) await consume(store, "blocked");
    jest.advanceTimersByTime(120000);
    expect(store.storage.size).toBe(0);
  });
});
