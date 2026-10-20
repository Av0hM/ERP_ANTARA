import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authenticateWithBackend, BackendAuthError } from "./lib/backend-auth";
import { backendAuthCallbacks } from "./lib/auth-callbacks";

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

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: resolvedNextAuthSecret,
  trustHost: true,
  pages: { error: "/login/error" },
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
  callbacks: backendAuthCallbacks(apiUrl),
});
