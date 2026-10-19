import { expect, test } from "@playwright/test";
import type { Account, User } from "next-auth";
import { backendSignIn } from "../src/lib/backend-sign-in";
import { validateAuthResponse } from "oauth4webapi";

const account: Account = {
  provider: "google",
  providerAccountId: "google-sub",
  type: "oidc",
  id_token: "private-id-token",
};
const user = (): User => ({
  id: "google-sub",
  name: "Google profile",
  role: "",
});

for (const status of [401, 403, 429, 500, 502, 503]) {
  test(`Google backend ${status} selects cooldown only for 429`, async () => {
    const original = globalThis.fetch;
    try {
      globalThis.fetch = async () => new Response("private-error", { status });
      const actor = user();
      if (status === 429) {
        expect(
          await backendSignIn("http://localhost/api", actor, account),
        ).toBe("/login/rate-limited");
      } else {
        expect(
          await backendSignIn("http://localhost/api", actor, account),
        ).toBe(
          status < 500
            ? "/login/error?reason=account-denied"
            : "/login/error?reason=service-unavailable",
        );
      }
      expect(actor.accessToken).toBeUndefined();
    } finally {
      globalThis.fetch = original;
    }
  });
}
test("backend exchange occurs once and hands backend identity/tokens to JWT callback", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        user: {
          id: "db-id",
          name: "Backend name",
          email: "fixture@example.invalid",
          role: "ADMIN",
        },
        accessToken: "access",
        refreshToken: "refresh",
        accessTokenExpiresAt: "2030-01-01T00:00:00.000Z",
      });
    };
    const actor = user();
    expect(await backendSignIn("http://localhost/api", actor, account)).toBe(
      true,
    );
    expect(calls).toBe(1);
    expect(actor).toMatchObject({
      id: "db-id",
      role: "ADMIN",
      accessToken: "access",
      refreshToken: "refresh",
    });
  } finally {
    globalThis.fetch = original;
  }
});
test("timeout is not a cooldown redirect", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new DOMException("timeout", "TimeoutError");
    };
    expect(await backendSignIn("http://localhost/api", user(), account)).toBe(
      "/login/error?reason=service-unavailable",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("missing issuer rejects at OAuth validation before the backend mapping", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 429 });
    };
    const callback = async () => {
      validateAuthResponse(
        {
          issuer: "https://accounts.google.com",
          authorization_response_iss_parameter_supported: true,
        },
        { client_id: "fixture" },
        new URLSearchParams({ code: "fixture", state: "state" }),
        "state",
      );
      return backendSignIn("http://localhost/api", user(), account);
    };
    await expect(callback()).rejects.toThrow(
      'response parameter "iss" (issuer) missing',
    );
    expect(calls).toBe(0);
  } finally {
    globalThis.fetch = original;
  }
});
test("missing Google token cannot become cooldown", async () => {
  await expect(
    backendSignIn("http://localhost/api", user(), {
      ...account,
      id_token: undefined,
    }),
  ).rejects.toThrow("Google identity token is missing");
});
