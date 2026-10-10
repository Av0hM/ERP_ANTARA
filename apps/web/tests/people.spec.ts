import { encode } from "next-auth/jwt";
import { test, expect, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:4105/api";
const password = "People#Browser123";
// This flow provisions and signs in three separate real accounts using production password hashing.
test.setTimeout(90_000);
async function login(
  page: Page,
  email = "owner@shell.invalid",
  pass = "Shell#Fixture123",
) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(pass);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open profile menu" }),
  ).toBeVisible();
}
async function token(page: Page): Promise<string> {
  return (await (await page.request.get("/api/auth/session")).json())
    .accessToken;
}
async function create(
  page: Page,
  email: string,
  grants: Record<string, string>,
) {
  await page.goto("/people");
  await page
    .getByRole("button", { name: "Invite Person", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email", { exact: true }).fill(email);
  for (const [name, value] of Object.entries(grants))
    await dialog
      .getByLabel(`${name} access`, { exact: true })
      .selectOption(value);
  await dialog
    .getByRole("button", { name: "Create invitation", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Invitation created" }),
  ).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveText(
    "Invitation created. Email delivery is disabled.",
  );
  const url = await dialog.getByLabel("Invitation link").inputValue();
  await expect(dialog.getByRole("button", { name: "Copy Link" })).toBeVisible();
  await dialog.getByRole("button", { name: "Copy Link", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "Copied", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  return url;
}
async function accept(page: Page, url: string, name: string) {
  await page.goto(url);
  await expect(page.getByText(/Expires/)).toBeVisible();
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(page.getByText(/Access updated/)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
}

test("OWNER Copy Link onboarding gives ADCS MEMBER only; MEMBER People denied", async ({
  page,
  browser,
}) => {
  await login(page);
  const email = "people-adcs@browser.invalid";
  const url = await create(page, email, { ADCS: "MEMBER" });
  const context = await browser.newContext();
  const member = await context.newPage();
  await accept(member, url, "People ADCS");
  await login(member, email, password);
  const options = member
    .getByLabel("Dashboard context", { exact: true })
    .locator("option");
  await expect(options).toHaveCount(2);
  await expect(options).toContainText(["Personal Dashboard", "ADCS"]);
  await expect(
    member.getByRole("link", { name: "People", exact: true }),
  ).toHaveCount(0);
  const response = await member.request.get(`${origin}/users`, {
    headers: { Authorization: `Bearer ${await token(member)}` },
  });
  expect(response.status()).toBe(403);
  await member.goto("/people");
  await expect(
    member.getByRole("alert").filter({ hasText: "do not have permission" }),
  ).toContainText("do not have permission");
  await context.close();
});

test("mixed Payload ADMIN / ADCS MEMBER onboarding and scoped invitations", async ({
  page,
  browser,
}) => {
  await login(page);
  const email = "people-mixed@browser.invalid";
  const url = await create(page, email, { ADCS: "MEMBER", Payload: "ADMIN" });
  const context = await browser.newContext();
  const admin = await context.newPage();
  await accept(admin, url, "People Mixed");
  await login(admin, email, password);
  const options = admin
    .getByLabel("Dashboard context", { exact: true })
    .locator("option");
  await expect(options).toHaveCount(3);
  await expect(options).toContainText([
    "Admin Dashboard",
    "ADCS — Read",
    "Payload — Admin",
  ]);
  await admin.goto("/people");
  await admin.getByRole("button", { name: "Invite Person" }).click();
  const dialog = admin.getByRole("dialog");
  await expect(dialog.getByLabel("Payload access")).toBeVisible();
  await expect(dialog.getByLabel("ADCS access")).toHaveCount(0);
  await expect(
    dialog.getByRole("radio", { name: "Owner", exact: true }),
  ).toHaveCount(0);
  await expect(
    dialog.getByLabel("Payload access").locator('option[value="ADMIN"]'),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const childUrl = await create(admin, "people-payload@browser.invalid", {
    Payload: "MEMBER",
  });
  const childContext = await browser.newContext();
  const child = await childContext.newPage();
  await accept(child, childUrl, "Payload Member");
  await login(child, "people-payload@browser.invalid", password);
  await expect(
    child.getByLabel("Dashboard context").locator("option"),
  ).toHaveCount(2);
  const ui = await (
    await admin.request.get(`${origin}/ui/context`, {
      headers: { Authorization: `Bearer ${await token(admin)}` },
    })
  ).json();
  const adcs = ui.contexts.find(
    (c: { key?: string }) => c.key === "ADCS",
  ).subsystemId;
  const payload = ui.contexts.find(
    (c: { key?: string }) => c.key === "PAYLOAD",
  ).subsystemId;
  for (const grant of [
    { subsystemId: adcs, accessLevel: "MEMBER" },
    { subsystemId: payload, accessLevel: "ADMIN" },
  ]) {
    expect(
      (
        await admin.request.post(`${origin}/invitations`, {
          headers: { Authorization: `Bearer ${await token(admin)}` },
          data: {
            email: "crafted@browser.invalid",
            globalRole: "MEMBER",
            memberships: [grant],
          },
        })
      ).status(),
    ).toBe(403);
  }
  await childContext.close();
  await context.close();
});

test("wrong account cannot accept invitation; OWNER sees history and can revoke", async ({
  page,
}) => {
  await login(page);
  const url = await create(page, "wrong-account@browser.invalid", {
    ADCS: "MEMBER",
  });
  await page.goto(url);
  await expect(
    page.getByRole("alert").filter({ hasText: "different account" }),
  ).toContainText("different account");
  await expect(
    page.getByRole("button", { name: "Accept invitation", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.goto("/people");
  await page.getByRole("button", { name: "Invitations", exact: true }).click();
  const row = page
    .getByRole("article")
    .filter({ hasText: "wrong-account@browser.invalid" });
  await row.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(row).toContainText("REVOKED");
  await page.goto(url);
  await expect(page.getByText(/invalid, expired or no longer/)).toBeVisible();
});

test("OWNER security controls refresh rows, preserve quorum, mobile dialog keyboard works", async ({
  page,
}) => {
  await login(page);
  await page.goto("/people");
  await page.screenshot({
    path: "/tmp/antara-people-desktop.png",
    fullPage: true,
  });
  const owner = page
    .getByRole("article")
    .filter({ hasText: "owner@shell.invalid" });
  await owner.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  const member = page
    .getByRole("article")
    .filter({ hasText: "member@shell.invalid" });
  await member.getByRole("button", { name: "Deactivate", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(member).toContainText("Inactive");
  await member.getByRole("button", { name: "Reactivate", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    member.getByRole("button", { name: "Deactivate", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Invite Person", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByLabel("Email", { exact: true }),
  ).toBeFocused();
  await page.screenshot({
    path: "/tmp/antara-people-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("verified Google pending identity explicitly accepts, clears pending state and signs out", async ({
  page,
  browser,
}) => {
  await login(page);
  const url = await create(page, "people-google@browser.invalid", {
    Payload: "ADMIN",
    ADCS: "MEMBER",
  });
  // Only Google's external verifier is doubled. Backend eligibility, DB, grants and sessions are real.
  const response = await page.request.post(`${origin}/auth/google-callback`, {
    data: { idToken: "people-google-fixture" },
  });
  expect(response.status()).toBe(201);
  const result: {
    user: { id: string; name: string; email: string; role: string };
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: string;
  } = await response.json();
  expect(result.user.role).toBe("MEMBER");
  const context = await browser.newContext();
  const cookie = await encode({
    secret: "phase5-local-browser-fixture-secret",
    salt: "authjs.session-token",
    token: {
      sub: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpires: Date.parse(result.accessTokenExpiresAt),
    },
  });
  await context.addCookies([
    {
      name: "authjs.session-token",
      value: cookie,
      url: "http://127.0.0.1:3105",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const google = await context.newPage();
  await google.goto(url);
  await expect(google.getByLabel("Password", { exact: true })).toHaveCount(0);
  await google
    .getByRole("button", { name: "Accept invitation", exact: true })
    .click();
  await expect(google.getByText(/Access updated/)).toBeVisible();
  await expect(google).toHaveURL(/\/login$/);
  expect(
    (
      await page.request.post(`${origin}/auth/refresh`, {
        data: { refreshToken: result.refreshToken },
      })
    ).status(),
  ).toBe(401);
  const next = await page.request.post(`${origin}/auth/google-callback`, {
    data: { idToken: "people-google-fixture" },
  });
  expect(next.status()).toBe(201);
  expect((await next.json()).user.role).toBe("ADMIN");
  await context.close();
});
