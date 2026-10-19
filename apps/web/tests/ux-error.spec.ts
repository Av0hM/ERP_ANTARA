import { test, expect } from "@playwright/test";
import {
  classifyError,
  fromHttpStatus,
  safeDiagnostics,
  validationFields,
  uxError,
} from "../src/lib/ux-error";
import { ApiError, apiFetch, checkApiResponse } from "../src/lib/http-error";

for (const [status, code] of [
  [400, "VALIDATION_ERROR"],
  [401, "SESSION_EXPIRED"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [409, "CONFLICT"],
  [429, "RATE_LIMITED"],
  [500, "UNKNOWN_ERROR"],
  [503, "SERVICE_UNAVAILABLE"],
] as const) {
  test(`HTTP ${status} safely maps to ${code}`, () =>
    expect(fromHttpStatus(status).code).toBe(code));
}
test("arbitrary errors and OAuth validation never become rate limits", () => {
  for (const error of [
    new Error('response parameter "iss" missing'),
    new Error("password=secret"),
    new TypeError("bug"),
    null,
  ]) {
    expect(classifyError(error).code).toBe("UNKNOWN_ERROR");
    expect(JSON.stringify(classifyError(error))).not.toContain("secret");
  }
});
test("validation preserves allowlisted field association without server text", () => {
  expect(
    validationFields(
      {
        message: [
          "title must not be empty",
          "password contains secret",
          "email must be an email",
        ],
      },
      ["title", "email"],
    ),
  ).toEqual({
    title: "Check this field's value.",
    email: "Check this field's value.",
  });
});
test("HTTP exception is safe and retains status", async () => {
  try {
    await checkApiResponse(
      new Response(JSON.stringify({ message: "database password=secret" }), {
        status: 503,
      }),
    );
    throw new Error("Expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(classifyError(error).code).toBe("SERVICE_UNAVAILABLE");
    expect(JSON.stringify(error)).not.toContain("secret");
  }
});
test("network and timeout are distinct from HTTP service failure, with no retries", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      throw new TypeError("private host");
    };
    await expect(apiFetch("http://fixture.invalid")).rejects.toMatchObject({
      ux: { code: "NETWORK_ERROR" },
    });
    globalThis.fetch = async () => {
      calls++;
      throw new DOMException("private", "TimeoutError");
    };
    await expect(apiFetch("http://fixture.invalid")).rejects.toMatchObject({
      ux: { code: "REQUEST_TIMEOUT" },
    });
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = original;
  }
});
test("diagnostics contain only controlled fields", () => {
  const result = safeDiagnostics(
    uxError("FORBIDDEN"),
    "Tasks",
    new Date("2030-01-01T00:00:00Z"),
  );
  expect(result).toBe(
    "ANTARA ERP\nError code: FORBIDDEN\nTime: 2030-01-01T00:00:00.000Z\nPage: Tasks",
  );
});

test("people mutation never displays raw response text or retries writes", async () => {
  const { peopleRequest } = await import("../src/lib/people-api");
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({ message: "private SQL credential" }),
        { status: 409 },
      );
    };
    await expect(
      peopleRequest("/users/test", "fixture", "PATCH", { name: "draft" }),
    ).rejects.toMatchObject({ ux: { code: "CONFLICT" } });
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = original;
  }
});
test("file failure does not expose provider body", async () => {
  const { fileLifecycle } = await import("../src/lib/operations-api");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ message: "private provider URL secret" }), {
        status: 503,
      });
    await expect(
      fileLifecycle("fixture", "delete", "fixture"),
    ).rejects.toMatchObject({ ux: { code: "SERVICE_UNAVAILABLE" } });
  } finally {
    globalThis.fetch = original;
  }
});

test("auth errors never infer rate limiting and destinations discard callback state", async () => {
  const { authFailureMessage, safeLoginDestination } =
    await import("../src/lib/auth-ux");
  for (const code of [
    "Configuration",
    "CallbackRouteError",
    "InvalidCheck",
    "OAuthCallbackError",
    "rate_limited",
    "private token",
  ])
    expect(authFailureMessage(code)).not.toContain("90");
  for (const url of [
    "https://evil.invalid",
    "//evil.invalid",
    "/api/auth/callback/google?code=secret",
    "/tasks?state=secret",
    "/tasks#secret",
  ])
    expect(safeLoginDestination(url)).toBe("/dashboard");
  expect(safeLoginDestination("/tasks")).toBe("/tasks");
});

test("task list failures are not empty successes and forbidden remains distinct", async () => {
  const { fetchTasks } = await import("../src/lib/task-api");
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("{}", { status: 403 });
    await expect(fetchTasks("fixture")).rejects.toMatchObject({
      ux: { code: "FORBIDDEN" },
    });
    globalThis.fetch = async () => new Response("{}", { status: 503 });
    await expect(fetchTasks("fixture")).rejects.toMatchObject({
      ux: { code: "SERVICE_UNAVAILABLE" },
    });
    globalThis.fetch = async () => new Response("[]");
    await expect(fetchTasks("fixture")).resolves.toEqual([]);
  } finally {
    globalThis.fetch = original;
  }
});

test("malformed success bodies cannot leak raw JSON fragments", async () => {
  const { apiJson } = await import("../src/lib/http-error");
  await expect(
    apiJson(new Response("private credential = invalid JSON")),
  ).rejects.toMatchObject({ ux: { code: "UNKNOWN_ERROR" } });
});

test("only explicit quorum code conveys atomic account rollback", async () => {
  try {
    await checkApiResponse(
      Response.json(
        { code: "LAST_ACTIVE_OWNER", message: "private backend text" },
        { status: 409 },
      ),
    );
  } catch (error) {
    expect(classifyError(error).message).toContain(
      "No account changes were saved",
    );
    expect(classifyError(error).message).not.toContain("private");
  }
  expect(fromHttpStatus(409).message).not.toContain(
    "No account changes were saved",
  );
  expect(fromHttpStatus(413).code).toBe("UPLOAD_TOO_LARGE");
});
