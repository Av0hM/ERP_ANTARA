import { test, expect } from "@playwright/test";

test.setTimeout(60_000);

test("credential login reaches the dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("Email").fill("owner@antara.club");
  await page.getByLabel("Password").fill("antara123erp");
  await page.getByRole("button", { name: "Sign In" }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /mission control dashboard/i })).toBeVisible();
});

