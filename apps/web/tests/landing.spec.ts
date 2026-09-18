import { test, expect } from "@playwright/test";

test("landing page exposes product headline", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/AI-powered operations and collaboration/i)).toBeVisible();
});

