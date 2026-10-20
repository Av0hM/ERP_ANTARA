import { z } from "zod";

export class BackendAuthError extends Error {
  constructor(
    readonly code: "credentials" | "rate_limited" | "backend_unavailable",
    readonly retryAt?: number,
  ) {
    super(code);
    this.name = "BackendAuthError";
  }
}

const authResponse = z.object({
  user: z.object({
    id: z.string().min(1),
    email: z.string().email(),
    name: z.string(),
    role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
  }),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessTokenExpiresAt: z.string().datetime(),
});

export function backendRetryAt(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const deadline = /^\d+$/.test(value.trim())
    ? now + Number(value) * 1000
    : Date.parse(value);
  return Number.isSafeInteger(deadline) && deadline > now
    ? deadline
    : undefined;
}

export async function authenticateWithBackend(
  apiUrl: string,
  provider: "login" | "google-callback",
  credentials: { email: string; password: string } | { idToken: string },
) {
  try {
    const response = await fetch(`${apiUrl}/auth/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      if (response.status === 429) {
        // Server-only diagnostic: never log credentials, Google tokens or response bodies.
        console.warn({
          event: "backend_auth_rate_limited",
          endpoint: `/auth/${provider}`,
          status: response.status,
          retryAt: backendRetryAt(response.headers.get("Retry-After")),
        });
      }
      throw new BackendAuthError(
        response.status === 429
          ? "rate_limited"
          : response.status === 401 || response.status === 403
            ? "credentials"
            : "backend_unavailable",
        response.status === 429
          ? backendRetryAt(response.headers.get("Retry-After"))
          : undefined,
      );
    }
    const payload = authResponse.parse(await response.json());
    return {
      ...payload.user,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      accessTokenExpiresAt: payload.accessTokenExpiresAt,
    };
  } catch (error) {
    if (error instanceof BackendAuthError) throw error;
    throw new BackendAuthError("backend_unavailable");
  }
}
