import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

let db: PrismaClient;
let adcs: string;
let payload: string;
const origin = "http://127.0.0.1:4105/api";
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${role}@shell.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("Shell#Fixture123");
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open profile menu" }),
  ).toBeVisible();
}
async function token(page: Page): Promise<string> {
  const session: { accessToken: string } = await (
    await page.request.get("/api/auth/session")
  ).json();
  return session.accessToken;
}
async function api(page: Page, path: string, method = "GET") {
  return page.request.fetch(`${origin}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await token(page)}` },
    ...(method === "PATCH" ? { data: { isRead: true } } : {}),
  });
}
async function choose(page: Page, id: string) {
  await page.getByLabel("Dashboard context", { exact: true }).selectOption(id);
  await expect(page).toHaveURL(new RegExp(`context=${encodeURIComponent(id)}`));
}
test.beforeAll(async () => {
  const source = process.env.PHASE5_TEST_DATABASE_URL;
  if (!source) throw new Error("Explicit test URL required");
  const url = new URL(source);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/antara_phase5_test")
    throw new Error("Local test database only");
  const fixture: { schema: string; catalog: { key: string; id: string }[] } =
    JSON.parse(readFileSync("/tmp/antara-phase5-fixture.json", "utf8"));
  if (!/^phase5_browser_\d+$/.test(fixture.schema))
    throw new Error("Invalid fixture schema");
  url.searchParams.set("schema", fixture.schema);
  db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  adcs = fixture.catalog.find((s) => s.key === "ADCS")!.id;
  payload = fixture.catalog.find((s) => s.key === "PAYLOAD")!.id;
});
test.beforeEach(async () => {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" ORDER BY id FOR UPDATE`;
    await tx.user.update({ where: { id: "admin" }, data: { role: "ADMIN" } });
    for (const [userId, subsystemId, accessLevel] of [
      ["admin", adcs, "ADMIN"],
      ["admin", payload, "MEMBER"],
      ["member", adcs, "MEMBER"],
    ] as const)
      await tx.subsystemMembership.upsert({
        where: { userId_subsystemId: { userId, subsystemId } },
        create: { userId, subsystemId, accessLevel },
        update: { accessLevel },
      });
    for (const userId of ["owner", "admin", "member"])
      await tx.notification.upsert({
        where: { id: `notice-${userId}` },
        create: {
          id: `notice-${userId}`,
          userId,
          title: "Protected title",
          body: "Protected body",
          type: "SYSTEM",
        },
        update: { isRead: false },
      });
  });
});
test.afterAll(async () => {
  await db?.$disconnect();
});

test("OWNER branding, five contexts, switching and notification/profile menus", async ({
  page,
}) => {
  await login(page, "owner");
  await expect(
    page.getByRole("img", { name: "ANTARA logo" }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("ANTARA ERP", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Global Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Dashboard context").locator("option"),
  ).toHaveCount(6);
  const response = page.waitForResponse((r) =>
    r.url().includes(`/analytics/bundle?subsystemId=${adcs}`),
  );
  await choose(page, `subsystem:${adcs}`);
  expect((await response).status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "ADCS", exact: true }),
  ).toBeVisible();
  await choose(page, `subsystem:${payload}`);
  await expect(
    page.getByRole("heading", { name: "Payload", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
  await expect(
    page.getByRole("menu", { name: /Notifications,/ }),
  ).toBeVisible();
  await expect(page.getByText(/SECRET|Protected historical body/)).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open profile menu" }).click();
  await expect(
    page.getByRole("menu", { name: "Open profile menu" }),
  ).toContainText("Shell OWNER");
  await expect(
    page.getByRole("menu", { name: "Open profile menu" }),
  ).toContainText("OWNER");
});

test("mixed ADMIN manages ADCS but has read-only Payload context", async ({
  page,
}) => {
  await login(page, "admin");
  await expect(
    page.getByLabel("Dashboard context").locator("option"),
  ).toHaveCount(3);
  await expect(page.getByLabel("Dashboard context")).not.toContainText("SDM");
  await expect(page.getByLabel("Dashboard context")).toContainText(
    "Payload — Read",
  );
  await choose(page, `subsystem:${adcs}`);
  await expect(
    page.getByRole("heading", { name: "ADCS", exact: true }),
  ).toBeVisible();
  const analytics: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("analytics/bundle")) analytics.push(req.url());
  });
  await choose(page, `subsystem:${payload}`);
  await expect(
    page.getByText("Readable subsystem context", { exact: false }),
  ).toBeVisible();
  expect(analytics.some((url) => url.includes(payload))).toBe(false);
  await expect(page.getByText("Workload Balance", { exact: true })).toHaveCount(
    0,
  );
  expect(
    (await api(page, `/analytics/bundle?subsystemId=${payload}`)).status(),
  ).toBe(403);
});

test("MEMBER personal dashboard, readable context and no administrative controls", async ({
  page,
}) => {
  await login(page, "member");
  await expect(
    page.getByRole("heading", { name: "Personal Dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Dashboard context").locator("option"),
  ).toHaveCount(2);
  await expect(page.getByLabel("Dashboard context")).not.toContainText(
    "Payload",
  );
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Resources", exact: true }),
  ).toHaveCount(0);
  await page.goto("/tasks");
  await expect(
    page.getByRole("button", { name: "Create Task", exact: true }),
  ).toHaveCount(0);
  await choose(page, `subsystem:${adcs}`);
  await expect(
    page.getByRole("heading", { name: "ADCS", exact: true }),
  ).toBeVisible();
});

test("stored unauthorized context is rejected before protected dashboard requests", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("antara.context.member", "subsystem:unrelated"),
  );
  const forbidden: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("subsystemId=unrelated")) forbidden.push(r.url());
  });
  await login(page, "member");
  await expect(page.getByLabel("Dashboard context")).toHaveValue("personal");
  expect(forbidden).toEqual([]);
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("antara.context.member")),
    )
    .toBe("personal");
});

test("membership revocation removes context and cached content on next refresh", async ({
  page,
}) => {
  await login(page, "member");
  await choose(page, `subsystem:${adcs}`);
  await expect(
    page.getByRole("heading", { name: "ADCS", exact: true }),
  ).toBeVisible();
  await db.subsystemMembership.delete({
    where: { userId_subsystemId: { userId: "member", subsystemId: adcs } },
  });
  await page
    .getByRole("button", { name: "Refresh available contexts" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Personal Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Dashboard context")).toHaveCount(0);
  await expect(page.getByText("No personal tasks assigned.")).toBeVisible();
});

test("ADMIN removal overrides stale session claims and removes management navigation", async ({
  page,
}) => {
  await login(page, "admin");
  await choose(page, `subsystem:${adcs}`);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id='admin' FOR UPDATE`;
    await tx.subsystemMembership.delete({
      where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
    });
    await tx.user.update({ where: { id: "admin" }, data: { role: "MEMBER" } });
  });
  await page
    .getByRole("button", { name: "Refresh available contexts" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Personal Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Dashboard context")).not.toContainText("ADCS");
  await expect(
    page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Resources", exact: true }),
  ).toHaveCount(0);
});

test("notifications support read/all, recipient isolation and safe history", async ({
  page,
}) => {
  await login(page, "member");
  const contextResponse = await api(page, "/ui/context");
  const json = await contextResponse.text();
  expect(json).not.toMatch(
    /passwordHash|refreshTokenHash|deletedAt|isDummySeed|email/,
  );
  expect(
    (await api(page, "/notifications/notice-owner", "PATCH")).status(),
  ).toBe(404);
  expect(
    (await api(page, "/notifications/history?cursor=notice-owner")).status(),
  ).toBe(404);
  await page.getByRole("button", { name: /Notifications, 1 unread/ }).click();
  await page
    .getByRole("menuitem", { name: /Unread — select to mark read/ })
    .click();
  await expect(
    page.getByRole("menu", { name: /Notifications, 0 unread/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark unread", exact: true }).click();
  await page
    .getByRole("button", { name: "Mark all as read", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Notifications, 0 unread/ }),
  ).toBeVisible();
  expect(
    await db.notification.count({ where: { userId: "owner", isRead: false } }),
  ).toBe(1);
  await page
    .getByRole("button", { name: "Delete notification", exact: true })
    .click();
  await expect(page.getByText("No notifications yet.")).toBeVisible();
});

test("notification failures are visible and retry recovers", async ({
  page,
}) => {
  await login(page, "member");
  await page.route("**/api/notifications/history", (route) =>
    route.fulfill({ status: 503, body: "{}", contentType: "application/json" }),
  );
  await page.goto("/notifications");
  await expect(
    page.getByRole("alert").filter({ hasText: "Unable to load notifications" }),
  ).toBeVisible();
  await page.unroute("**/api/notifications/history");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mark read", exact: true }),
  ).toBeVisible();
});

for (const role of ["owner", "admin", "member"])
  test(`${role} logout revokes backend session and hides protected pages`, async ({
    page,
  }) => {
    await login(page, role);
    const access = await token(page);
    await page.getByRole("button", { name: "Open profile menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(
      (
        await page.request.get(`${origin}/ui/context`, {
          headers: { Authorization: `Bearer ${access}` },
        })
      ).status(),
    ).toBe(401);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Global Dashboard", exact: true }),
    ).toHaveCount(0);
  });

test("desktop collapse, mobile widths and keyboard menu focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, "owner");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await page.getByLabel("Dashboard context").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Notifications,/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("menu", { name: /Notifications,/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /Notifications,/ }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Open profile menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open profile menu" }),
  ).toBeFocused();
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: /Notifications,/ }).click();
    const box = await page
      .getByRole("menu", { name: /Notifications,/ })
      .boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= width).toBeTruthy();
    await page.keyboard.press("Escape");
    if (width < 1024)
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" }),
      ).toBeVisible();
    await page.screenshot({
      path: `/tmp/antara-phase5-${width}.png`,
      fullPage: true,
    });
  }
});

test("revoked backend session clears the shell on its next access check", async ({
  page,
}) => {
  await login(page, "member");
  await db.session.updateMany({
    where: { userId: "member", revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await page
    .getByRole("button", { name: "Refresh available contexts" })
    .click();
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "Personal Dashboard", exact: true }),
  ).toHaveCount(0);
});

test("notification history paginates and mark-all includes older recipient rows", async ({
  page,
}) => {
  await db.notification.createMany({
    data: Array.from({ length: 23 }, (_, index) => ({
      id: `extra-${index}`,
      userId: "member",
      title: "Protected content",
      body: "Never display raw history",
      type: "SYSTEM" as const,
    })),
  });
  try {
    await login(page, "member");
    await page.goto("/notifications");
    await expect(
      page.getByRole("button", { name: "Mark read", exact: true }),
    ).toHaveCount(20);
    await page
      .getByRole("button", { name: "Load older notifications" })
      .click();
    await expect(
      page.getByRole("button", { name: "Mark read", exact: true }),
    ).toHaveCount(24);
    await expect(
      page.getByText("Protected content", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Mark all as read", exact: true })
      .click();
    await expect
      .poll(() =>
        db.notification.count({ where: { userId: "member", isRead: false } }),
      )
      .toBe(0);
    expect(
      await db.notification.count({
        where: { userId: "owner", isRead: false },
      }),
    ).toBe(1);
  } finally {
    await db.notification.deleteMany({
      where: { id: { startsWith: "extra-" } },
    });
  }
});
