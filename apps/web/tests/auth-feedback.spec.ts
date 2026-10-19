import { test, expect } from "@playwright/test";
test("session expiry explains next step without callback secrets", async ({
  page,
}) => {
  await page.goto("/login?reason=session-expired");
  await expect(page.getByText("Your session has expired.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sign in to AntaraERP" }),
  ).toBeVisible();
});
test("OAuth/configuration failures stay distinct from rate limiting", async ({
  page,
}) => {
  for (const error of ["Configuration", "OAuthCallbackError", "InvalidCheck"]) {
    await page.goto(
      `/login/error?error=${error}&code=private-code&state=private-state`,
    );
    await expect(
      page.getByRole("heading", { name: "Sign-in could not be completed" }),
    ).toBeVisible();
    await expect(page.getByText("Too many login attempts")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("private-code");
    await expect(
      page.getByRole("link", { name: "Back to login" }),
    ).toHaveAttribute("href", "/login");
  }
  await page.getByRole("link", { name: "Back to login" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("known backend auth failure has a safe service message and a fresh-login link", async ({
  page,
}) => {
  await page.goto("/login/error?reason=service-unavailable");
  await expect(
    page.getByText("The sign-in service is temporarily unavailable.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to login" }),
  ).toHaveAttribute("href", "/login");
  await expect(page.getByRole("timer")).toHaveCount(0);
});
