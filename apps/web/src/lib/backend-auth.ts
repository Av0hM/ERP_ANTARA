import { z } from "zod";

export class BackendAuthError extends Error {
  constructor(readonly code: "credentials" | "rate_limited" | "backend_unavailable") {
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

export async function authenticateWithBackend(
  apiUrl: string,
  provider: "login" | "google-callback",
  credentials: { email: string; password: string } | { email: string; name: string; avatarUrl?: string },
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
      throw new BackendAuthError(response.status === 429 ? "rate_limited"
        : response.status === 401 || response.status === 403 ? "credentials" : "backend_unavailable");
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
