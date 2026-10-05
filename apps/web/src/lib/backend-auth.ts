import { z } from "zod";

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
  const response = await fetch(`${apiUrl}/auth/${provider}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Authentication failed");
  const payload = authResponse.parse(await response.json());
  return {
    ...payload.user,
    accessToken: payload.accessToken,
    refreshToken: payload.refreshToken,
    accessTokenExpiresAt: payload.accessTokenExpiresAt,
  };
}
