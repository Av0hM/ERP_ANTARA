/** Validate syntax before providers connect. Never include supplied values in errors. */
export function validateEnvironment(env: Record<string, unknown>) {
  const production = env.NODE_ENV === "production";
  const text = (key: string) =>
    typeof env[key] === "string" ? (env[key] as string) : "";
  const url = (key: string, protocols: string[], required = production) => {
    const value = text(key);
    if (!value && !required) return;
    try {
      const parsed = new URL(value);
      if (
        !protocols.includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.hash
      )
        throw new Error();
      if (
        key === "FRONTEND_URL" &&
        (parsed.origin !== value || parsed.username || parsed.password)
      )
        throw new Error();
    } catch {
      throw new Error(`Invalid or missing ${key}`);
    }
  };
  url("DATABASE_URL", ["postgres:", "postgresql:"]);
  url("DIRECT_URL", ["postgres:", "postgresql:"], false);
  url("REDIS_URL", ["redis:", "rediss:"]);
  url("FRONTEND_URL", production ? ["https:"] : ["http:", "https:"]);
  if (production) {
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
      const value = text(key);
      if (value.length < 32 || /^(dev-|replace|change|example)/i.test(value))
        throw new Error(
          `Production ${key} must be a non-placeholder secret of at least 32 characters`,
        );
    }
  }
  for (const key of ["RATE_LIMIT_MAX_REQUESTS", "RATE_LIMIT_WINDOW_MS"]) {
    if (env[key] !== undefined)
      throw new Error(
        `Retired ${key}; configure explicit API_RATE_LIMIT settings`,
      );
  }
  for (const [key, max] of [
    ["PORT", 65535],
    ["API_RATE_LIMIT_USER_MAX", 1000],
    ["API_RATE_LIMIT_PUBLIC_SOURCE_MAX", 1000],
    ["API_RATE_LIMIT_SOURCE_FLOOD_MAX", 100000],
    ["API_RATE_LIMIT_WINDOW_MS", 900000],
  ] as const) {
    if (env[key] === undefined) continue;
    const value = Number(env[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error(`Invalid ${key}`);
    env[key] = value;
  }
  return env;
}
