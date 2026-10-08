import { validateEnvironment } from "./validate-environment";

const valid = () => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:secret@database.invalid/erp",
  REDIS_URL: "rediss://cache.invalid:6379",
  FRONTEND_URL: "https://erp.example.org",
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_REFRESH_SECRET: "b".repeat(40),
});
describe("release configuration", () => {
  it("accepts explicit production configuration without connecting", () =>
    expect(validateEnvironment(valid())).toEqual(valid()));
  it.each([
    "DATABASE_URL",
    "REDIS_URL",
    "FRONTEND_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ])("rejects missing %s", (key) =>
    expect(() => validateEnvironment({ ...valid(), [key]: "" })).toThrow(key),
  );
  it.each([
    "http://erp.example.org",
    "https://erp.example.org/path",
    "https://user:secret@erp.example.org",
    "*",
  ])("rejects unsafe origin %s", (origin) =>
    expect(() =>
      validateEnvironment({ ...valid(), FRONTEND_URL: origin }),
    ).toThrow("FRONTEND_URL"),
  );
  it("does not echo invalid secret values", () =>
    expect(() =>
      validateEnvironment({ ...valid(), DATABASE_URL: "SECRET_VALUE" }),
    ).toThrow(/^Invalid or missing DATABASE_URL$/));
  it("rejects placeholder secrets", () =>
    expect(() =>
      validateEnvironment({
        ...valid(),
        JWT_ACCESS_SECRET: "replace-with-openssl-rand-base64-32",
      }),
    ).toThrow("JWT_ACCESS_SECRET"));
  it("parses limiter settings as numbers", () =>
    expect(
      validateEnvironment({ ...valid(), RATE_LIMIT_WINDOW_MS: "60000" })
        .RATE_LIMIT_WINDOW_MS,
    ).toBe(60000));
  it("rejects malformed limiter settings", () =>
    expect(() =>
      validateEnvironment({ ...valid(), RATE_LIMIT_MAX_REQUESTS: "NaN" }),
    ).toThrow("RATE_LIMIT_MAX_REQUESTS"));
});
