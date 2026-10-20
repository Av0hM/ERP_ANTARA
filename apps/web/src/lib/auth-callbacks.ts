import type { NextAuthConfig } from "next-auth";
import { backendSignIn } from "./backend-sign-in";

async function refreshAccessToken(
  apiUrl: string,
  token: {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    role?: string;
    sub?: string;
    email?: string | null;
    name?: string | null;
  },
) {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refreshToken: token.refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error("Refresh failed");
    }

    const payload = (await response.json()) as {
      user: { id: string; email: string; name: string; role: string };
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresAt: string;
    };

    return {
      ...token,
      sub: payload.user.id,
      email: payload.user.email,
      name: payload.user.name,
      role: payload.user.role,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      accessTokenExpires: new Date(payload.accessTokenExpiresAt).getTime(),
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export function backendAuthCallbacks(
  apiUrl: string,
): NonNullable<NextAuthConfig["callbacks"]> {
  return {
    signIn: ({ user, account }) => backendSignIn(apiUrl, user, account),
    async jwt({ token, user }) {
      if (user) {
        const expires = Date.parse(user.accessTokenExpiresAt ?? "");
        if (
          !user.id ||
          !["OWNER", "ADMIN", "MEMBER"].includes(user.role) ||
          !user.accessToken ||
          !user.refreshToken ||
          !Number.isFinite(expires)
        ) {
          throw new Error("Backend session is incomplete");
        }
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = expires;
        return token;
      }

      if (
        typeof token.accessTokenExpires === "number" &&
        Date.now() < token.accessTokenExpires - 30_000
      ) {
        return token;
      }

      return refreshAccessToken(apiUrl, token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "");
        session.user.email = token.email ?? session.user.email;
        session.user.name = token.name ?? session.user.name;
        session.user.role = typeof token.role === "string" ? token.role : "";
        session.accessToken =
          typeof token.accessToken === "string" ? token.accessToken : undefined;
      }

      session.error = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  };
}
