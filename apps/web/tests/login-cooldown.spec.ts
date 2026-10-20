import { test, expect } from "@playwright/test";
const key = "antara.auth.rateLimitUntil";

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date("2030-01-01T00:00:00Z"));
});

test("90-second countdown, disabled keyboard/button, clean login and timestamp-only storage", async ({
  page,
}) => {
  await page.goto(
    "/login/rate-limited?code=private&state=private&iss=private&error=private&scope=private&retryAfter=0",
  );
  await expect(
    page.getByRole("region", { name: "Too many login attempts" }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("timer")).toHaveText("Retry available in 01:30");
  const blocked = page.getByRole("button", { name: "Try again" });
  await expect(blocked).toBeDisabled();
  await blocked.evaluate((button: HTMLButtonElement) => button.click());
  await blocked.evaluate((button: HTMLButtonElement) => button.focus());
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/rate-limited/);
  expect(await page.evaluate(() => Object.entries(sessionStorage))).toEqual([
    [key, String(Date.parse("2030-01-01T00:00:00Z") + 90000)],
  ]);
  await page.clock.runFor(89000);
  await expect(page.getByRole("timer")).toHaveText("Retry available in 00:01");
  await expect(blocked).toBeDisabled();
  await page.clock.runFor(1000);
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "You can try signing in again." }),
  ).toBeVisible();
  const back = page.getByRole("button", { name: "Back to login" });
  await expect(back).toBeEnabled();
  // Next's navigation scheduler uses timers too; boundary assertions above stay frozen.
  await page.clock.resume();
  await back.click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15000 });
  await expect(
    page.getByRole("heading", { name: "Sign in to AntaraERP" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("antara.auth.rateLimitUntil"),
    ),
  ).toBeNull();
});

test("reload preserves deadline after 30 seconds and remains ready after expiry", async ({
  page,
}) => {
  await page.goto("/login/rate-limited");
  await expect(
    page.getByRole("region", { name: "Too many login attempts" }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("timer")).toHaveText("Retry available in 01:30");
  const until = await page.evaluate(() =>
    sessionStorage.getItem("antara.auth.rateLimitUntil"),
  );
  await page.clock.runFor(30000);
  await page.reload();
  await expect(page.getByRole("timer")).toHaveText("Retry available in 01:00");
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("antara.auth.rateLimitUntil"),
    ),
  ).toBe(until);
  await page.clock.runFor(60000);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Back to login" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("antara.auth.rateLimitUntil"),
    ),
  ).toBe(until);
});

test("unavailable storage falls back to a page-local cooldown", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "sessionStorage", {
      get: () => {
        throw new DOMException("Unavailable", "SecurityError");
      },
    }),
  );
  await page.goto("/login/rate-limited");
  await expect(
    page.getByRole("region", { name: "Too many login attempts" }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("timer")).toHaveText("Retry available in 01:30");
  await page.clock.runFor(90000);
  await expect(
    page.getByRole("button", { name: "Back to login" }),
  ).toBeEnabled();
});

test("credentials rate-limit response uses cooldown and creates no automatic retry", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/auth/callback/credentials*", async (route) => {
    attempts++;
    await route.fulfill({
      json: {
        url: "http://127.0.0.1:3110/api/auth/error?error=CredentialsSignin&code=rate_limited",
      },
    });
  });
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "Email" })
    .fill("fixture@example.invalid");
  await page.getByLabel("Password", { exact: true }).fill("fixture-password");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/login\/rate-limited$/);
  await expect(
    page.getByRole("region", { name: "Too many login attempts" }),
  ).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("timer")).toHaveText("Retry available in 01:30");
  await page.clock.runFor(90000);
  expect(attempts).toBe(1);
});

test("mobile cooldown fits the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/login/rate-limited");
  await expect(
    page.getByRole("heading", { name: "Too many login attempts" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("longer backend Retry-After survives reload and expiry removes the key on return", async ({
  page,
}) => {
  await page.goto(
    `/login/rate-limited?retryAt=${Date.parse("2030-01-01T00:03:00Z")}`,
  );
  await expect(page.getByRole("timer")).toHaveText("Retry available in 03:00");
  await page.clock.runFor(90000);
  await page.reload();
  await expect(page.getByRole("timer")).toHaveText("Retry available in 01:30");
  await expect(page.getByRole("button", { name: "Try again" })).toBeDisabled();
  await page.clock.runFor(90000);
  await page.clock.resume();
  await page.getByRole("button", { name: "Back to login" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("antara.auth.rateLimitUntil"),
    ),
  ).toBeNull();
});

for (const offset of [-1000, 180000]) {
  test(`stored cooldown (${offset}) cannot redirect the login page`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ key, deadline }) => sessionStorage.setItem(key, String(deadline)),
      {
        key,
        deadline: Date.parse("2030-01-01T00:00:00Z") + offset,
      },
    );
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Sign In", exact: true }),
    ).toBeEnabled();
    await expect(page).toHaveURL(/\/login$/);
    if (offset < 0)
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem("antara.auth.rateLimitUntil"),
        ),
      ).toBeNull();
  });
}
