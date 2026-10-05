import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

// Requires a running API, migrated local database, and seed:dummy.
// Never substitute frontend fixtures for these authentication checks.
test.skip(process.env.E2E_REAL_BACKEND !== "true", "Set E2E_REAL_BACKEND=true with a seeded local API");
test.setTimeout(60_000);

for (const role of ["OWNER", "ADMIN", "MEMBER"]) {
  test(`${role} logs in with real tokens and receives the correct controls`, async ({ page, request }) => {
    const file = JSON.parse(readFileSync(path.resolve(__dirname, "../../../dummy-credentials.local.json"), "utf8")) as {
      users: Array<{ email: string; password: string; role: string }>;
    };
    const user = file.users.find((entry) => entry.role === role);
    if (!user) throw new Error(`Missing dummy ${role} account`);
    await page.goto("/login", { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign In", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const session = await page.evaluate(async () => {
      const response = await fetch("/api/auth/session");
      return response.json() as Promise<{ user: { role: string }; accessToken?: string }>;
    });
    expect(session.user.role).toBe(role);
    expect(session.accessToken).toBeTruthy();
    const apiUrl = process.env.API_URL ?? "http://localhost:4000/api";
    const tasks = await request.get(`${apiUrl}/tasks`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
    expect(tasks.status()).toBe(200);
    await page.goto("/tasks");
    await expect(page.getByText(`${role} workspace`, { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Task", exact: true })).toHaveCount(role === "MEMBER" ? 0 : 1);
    await page.goto("/decisions");
    await expect(page.getByRole("heading", { name: "Decision Log (ADR)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New Decision", exact: true })).toHaveCount(role === "MEMBER" ? 0 : 1);
  });
}
