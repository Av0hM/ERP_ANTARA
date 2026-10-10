import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authenticateWithBackend, BackendAuthError } from "./lib/backend-auth";

class BackendSignInError extends CredentialsSignin {
  constructor(code: string) {
    super();
    this.code = code;
  }
}

const apiUrl = process.env.API_URL ?? "http://localhost:4000/api";
const resolvedNextAuthSecret =
  process.env.NEXTAUTH_SECRET ??
  (process.env.NODE_ENV === "production" ? undefined : "dev-nextauth-secret");
async function refreshAccessToken(token: {
  accessToken?: string;
  accessTokenExpires?: number;
  refreshToken?: string;
  role?: string;
  sub?: string;
  email?: string | null;
  name?: string | null;
}) {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const response = await fetch(`${apiUrl}/auth/refresh`, {
      method: "POST",
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: resolvedNextAuthSecret,
  trustHost: true,
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const password = String(credentials?.password ?? "");

        if (!email || !password) {
          return null;
        }

        try {
          return await authenticateWithBackend(apiUrl, "login", {
            email,
            password,
          });
        } catch (error) {
          if (
            error instanceof BackendAuthError &&
            error.code !== "credentials"
          ) {
            throw new BackendSignInError(error.code);
          }
          // Invalid credentials never create a tokenless session.
        }

        return null;
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  events: {
    async signOut(message) {
      if (
        "token" in message &&
        typeof message.token?.refreshToken === "string"
      ) {
        const response = await fetch(`${apiUrl}/auth/logout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: message.token.refreshToken }),
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Backend session revocation failed");
      }
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        if (!account.id_token)
          throw new Error("Google identity token is missing");
        user = await authenticateWithBackend(apiUrl, "google-callback", {
          idToken: account.id_token,
        });
      }
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

      return refreshAccessToken(token);
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
  },
});
