import { test, expect } from "@playwright/test";
import { authenticateWithBackend } from "../src/lib/backend-auth";

test("Google exchange retains backend identity and tokens", async () => {
  const originalFetch = globalThis.fetch;
  let submitted: unknown;
  globalThis.fetch = async (_input, init) => {
    submitted = JSON.parse(String(init?.body));
    return Response.json({
      user: {
        id: "db-owner",
        email: "owner@dummy.local",
        name: "Owner",
        role: "OWNER",
      },
      accessToken: "access-token",
      refreshToken: "refresh-token",
      accessTokenExpiresAt: "2030-01-01T00:00:00.000Z",
    });
  };
  try {
    const user = await authenticateWithBackend(
      "http://localhost/api",
      "google-callback",
      {
        idToken: "google-signed-id-token",
      },
    );
    expect(user).toMatchObject({
      id: "db-owner",
      role: "OWNER",
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(submitted).toMatchObject({ idToken: "google-signed-id-token" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("backend rejection and incomplete tokens cannot create a session", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await expect(
      authenticateWithBackend("http://localhost/api", "login", {
        email: "owner@dummy.local",
        password: "test",
      }),
    ).rejects.toThrow();
    globalThis.fetch = async () =>
      Response.json({
        user: {
          id: "owner",
          email: "owner@dummy.local",
          name: "Owner",
          role: "OWNER",
        },
      });
    await expect(
      authenticateWithBackend("http://localhost/api", "google-callback", {
        idToken: "google-signed-id-token",
      }),
    ).rejects.toThrow();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

for (const [status, code] of [
  [401, "credentials"],
  [403, "credentials"],
  [429, "rate_limited"],
  [500, "backend_unavailable"],
  [503, "backend_unavailable"],
] as const) {
  test(`backend ${status} reports ${code}`, async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response(null, { status });
      await expect(
        authenticateWithBackend("http://localhost/api", "login", {
          email: "owner@dummy.local",
          password: "test",
        }),
      ).rejects.toMatchObject({ code });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("network failures report service unavailable", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await expect(
      authenticateWithBackend("http://localhost/api", "login", {
        email: "owner@dummy.local",
        password: "test",
      }),
    ).rejects.toMatchObject({ code: "backend_unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Google JWT exchange 429 identifies the exact endpoint without logging identity tokens", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const logs: unknown[] = [];
  let requested: unknown;
  try {
    console.warn = (entry: unknown) => {
      logs.push(entry);
    };
    globalThis.fetch = async (url) => {
      requested = url;
      return new Response("private backend detail", { status: 429 });
    };
    await expect(
      authenticateWithBackend("http://localhost/api", "google-callback", {
        idToken: "private-google-id-token",
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(requested).toBe("http://localhost/api/auth/google-callback");
    expect(logs).toEqual([
      {
        event: "backend_auth_rate_limited",
        endpoint: "/auth/google-callback",
        status: 429,
      },
    ]);
    expect(JSON.stringify(logs)).not.toContain("private");
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});

test("backend timeout is unavailable, never rate limited", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new DOMException("private timeout detail", "TimeoutError");
    };
    await expect(
      authenticateWithBackend("http://localhost/api", "google-callback", {
        idToken: "private-token",
      }),
    ).rejects.toMatchObject({ code: "backend_unavailable" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
