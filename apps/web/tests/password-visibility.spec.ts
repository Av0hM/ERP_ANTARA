import { test, expect } from "@playwright/test";

test("password can be revealed and hidden without submitting", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.fill("Example#123");
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(password).toHaveValue("Example#123");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(password).toHaveAttribute("type", "password");
  await expect(page).toHaveURL(/\/login/);
});
