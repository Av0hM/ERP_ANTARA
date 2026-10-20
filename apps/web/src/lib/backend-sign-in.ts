import type { Account, User } from "next-auth";
import { authenticateWithBackend, BackendAuthError } from "./backend-auth";

/** Runs after Auth.js validates OAuth, before it creates a session. With our
 * adapter-free JWT configuration the same User reaches the JWT callback.
 */
export async function backendSignIn(
  apiUrl: string,
  user: User,
  account: Account | null | undefined,
): Promise<true | string> {
  if (account?.provider !== "google") return true;
  if (!account.id_token) throw new Error("Google identity token is missing");
  try {
    Object.assign(
      user,
      await authenticateWithBackend(apiUrl, "google-callback", {
        idToken: account.id_token,
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof BackendAuthError && error.code === "rate_limited") {
      return error.retryAt
        ? `/login/rate-limited?retryAt=${error.retryAt}`
        : "/login/rate-limited";
    }
    if (error instanceof BackendAuthError) {
      return error.code === "backend_unavailable"
        ? "/login/error?reason=service-unavailable"
        : "/login/error?reason=account-denied";
    }
    throw error;
  }
}
