import { test, expect } from "@playwright/test";
import { authenticateWithBackend } from "../src/lib/backend-auth";

test("Google exchange retains backend identity and tokens", async () => {
  const originalFetch = globalThis.fetch;
  let submitted: unknown;
  globalThis.fetch = async (_input, init) => {
    submitted = JSON.parse(String(init?.body));
    return Response.json({
      user: { id: "db-owner", email: "owner@dummy.local", name: "Owner", role: "OWNER" },
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2030-01-01T00:00:00.000Z",
    });
  };
  try {
    const user = await authenticateWithBackend("http://localhost/api", "google-callback", {
      email: "owner@dummy.local", name: "Owner", avatarUrl: "https://example.test/avatar.png",
    });
    expect(user).toMatchObject({ id: "db-owner", role: "OWNER", accessToken: "access-token", refreshToken: "refresh-token" });
    expect(submitted).toMatchObject({ email: "owner@dummy.local", avatarUrl: "https://example.test/avatar.png" });
  } finally { globalThis.fetch = originalFetch; }
});

test("backend rejection and incomplete tokens cannot create a session", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await expect(authenticateWithBackend("http://localhost/api", "login", { email: "owner@dummy.local", password: "test" })).rejects.toThrow();
    globalThis.fetch = async () => Response.json({ user: { id: "owner", email: "owner@dummy.local", name: "Owner", role: "OWNER" } });
    await expect(authenticateWithBackend("http://localhost/api", "google-callback", { email: "owner@dummy.local", name: "Owner" })).rejects.toThrow();
  } finally { globalThis.fetch = originalFetch; }
});
