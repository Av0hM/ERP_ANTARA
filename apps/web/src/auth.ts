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
const resolvedNextAuthSecret = process.env.NEXTAUTH_SECRET ?? "dev-nextauth-secret";
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
          return await authenticateWithBackend(apiUrl, "login", { email, password });
        } catch (error) {
          if (error instanceof BackendAuthError && error.code !== "credentials") {
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
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") {
        return true;
      }

      const allowlist = process.env.GOOGLE_ALLOWED_EMAILS?.split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      if (!allowlist?.length) {
        return true;
      }

      const email = (profile as { email?: string | null } | null)?.email?.toLowerCase();
      return Boolean(email && allowlist.includes(email));
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        if (!profile?.email) throw new Error("Google profile is missing an email");
        user = await authenticateWithBackend(apiUrl, "google-callback", {
          email: profile.email.trim().toLowerCase(),
          name: profile.name ?? user?.name ?? profile.email,
          ...(user?.image ? { avatarUrl: user.image } : {}),
        });
      }
      if (user) {
        token.sub = (user as { id?: string }).id ?? token.sub;
        token.email = (user as { email?: string }).email ?? token.email;
        token.name = (user as { name?: string }).name ?? token.name;
        token.role = (user as { role?: string }).role ?? "MEMBER";
        token.accessToken = (user as { accessToken?: string }).accessToken;
        token.refreshToken = (user as { refreshToken?: string }).refreshToken;
        token.accessTokenExpires = (() => {
          const value = (user as { accessTokenExpiresAt?: string }).accessTokenExpiresAt;
          return value ? new Date(value).getTime() : Date.now() + 15 * 60 * 1000;
        })();
        return token;
      }

      if (typeof token.accessTokenExpires === "number" && Date.now() < token.accessTokenExpires - 30_000) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? "");
        session.user.email = token.email ?? session.user.email;
        session.user.name = token.name ?? session.user.name;
        session.user.role = String(token.role ?? "MEMBER");
        session.accessToken = typeof token.accessToken === "string" ? token.accessToken : undefined;
      }

      session.error = typeof token.error === "string" ? token.error : undefined;
      return session;
    },
  },
});
