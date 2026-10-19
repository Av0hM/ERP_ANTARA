/** Auth.js error labels are intentionally coarse. Never infer a limiter from Configuration. */
export function authFailureMessage(code: unknown, reason?: unknown): string {
  if (reason === "service-unavailable")
    return "The sign-in service is temporarily unavailable. Your sign-in was not completed. Please start a new attempt shortly.";
  if (reason === "account-denied")
    return "This account could not be verified for ANTARA ERP. Use your invited team account or contact an OWNER.";
  if (code === "AccessDenied")
    return "Sign-in was not completed or this account is not permitted. Start a new sign-in attempt, or contact your administrator.";
  if (code === "OAuthCallbackError" || code === "InvalidCheck")
    return "We could not verify this sign-in attempt. Start again from the login page. Do not refresh an old Google callback.";
  return "Sign-in could not be completed. Start a new attempt from the login page. If this continues, contact your administrator.";
}
/** Allow known internal destinations only; discard query/fragment and OAuth state. */
export function safeLoginDestination(value: unknown): string {
  if (typeof value !== "string") return "/dashboard";
  if (
    /^\/(dashboard|tasks|decisions|calendar|files|people|resources|reports|notifications|worklogs|analytics|subsystems)$/.test(
      value,
    )
  )
    return value;
  // Invitation acceptance is an existing login continuation. It stays in memory/URL, not diagnostics/storage.
  if (/^\/invite\/[a-zA-Z0-9_-]{16,256}$/.test(value)) return value;
  return "/dashboard";
}
