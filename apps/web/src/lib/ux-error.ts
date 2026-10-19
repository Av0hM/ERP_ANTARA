/** User-facing copy is application-owned, never a server exception message. */
const catalog = {
  AUTH_RATE_LIMITED: [
    "Too many login attempts",
    "For security, sign-in has been temporarily limited.",
    "Wait before signing in again",
    false,
  ],
  SESSION_EXPIRED: [
    "Your session has expired",
    "Sign in again to continue.",
    "Sign in again",
    false,
  ],
  ACCOUNT_INACTIVE: [
    "Your ANTARA ERP account is inactive",
    "Contact an OWNER or your project administrator if you believe this is incorrect.",
    "Contact your administrator",
    false,
  ],
  AUTH_REQUIRED: [
    "Sign in required",
    "Sign in to access ANTARA ERP.",
    "Sign in",
    false,
  ],
  FORBIDDEN: [
    "Access unavailable",
    "You do not have permission to perform this action. Your access may have changed.",
    "Check your current context or contact an administrator",
    false,
  ],
  NOT_FOUND: [
    "Item unavailable",
    "This item could not be found or is no longer available.",
    "Return to the list",
    false,
  ],
  VALIDATION_ERROR: [
    "Check your input",
    "Review the highlighted fields before submitting again.",
    "Review input",
    false,
  ],
  CONFLICT: [
    "This change could not be applied",
    "The item may have changed. Check its latest state before submitting again.",
    "Review latest state",
    false,
  ],
  NETWORK_OFFLINE: [
    "You're offline",
    "Reconnect to continue. Do not resubmit a change until you have checked whether it was saved.",
    "Check your connection",
    true,
  ],
  NETWORK_ERROR: [
    "Could not reach ANTARA",
    "Check your connection. We could not confirm the request outcome.",
    "Check the latest state before retrying",
    true,
  ],
  REQUEST_TIMEOUT: [
    "This is taking longer than expected",
    "We could not confirm the request outcome. It may still finish on the server.",
    "Check the latest state before retrying",
    true,
  ],
  SERVICE_UNAVAILABLE: [
    "ANTARA services are temporarily unavailable",
    "We could not complete this request. Check the latest state before repeating a change.",
    "Try again shortly",
    true,
  ],
  EXTERNAL_SYNC_FAILED: [
    "External sync unavailable",
    "The external service could not complete synchronization. Check the ERP record before retrying sync.",
    "Check sync status",
    true,
  ],
  UPLOAD_TOO_LARGE: [
    "File exceeds the upload limit",
    "Choose a smaller file. The server did not accept this upload.",
    "Choose a smaller file",
    false,
  ],
  UPLOAD_FAILED: [
    "File upload unavailable",
    "The file upload could not be confirmed. Check the file list before retrying.",
    "Check files and retry",
    true,
  ],
  AI_UNAVAILABLE: [
    "ANTARA AI is currently unavailable",
    "Tasks, files, calendar and other ERP features are unaffected.",
    "Retry AI later",
    true,
  ],
  RATE_LIMITED: [
    "Too many requests",
    "Please wait before trying again.",
    "Wait and retry",
    true,
  ],
  UNKNOWN_ERROR: [
    "We could not complete this request",
    "Check the latest state before repeating a change. Contact support if this continues.",
    "Review and retry",
    false,
  ],
} as const;
export type UxErrorCode = keyof typeof catalog;
export interface UxError {
  code: UxErrorCode;
  title: string;
  message: string;
  severity: "error" | "warning";
  retryable: boolean;
  action: string;
  reference?: string;
  fields: Record<string, string>;
}
export function uxError(
  code: UxErrorCode,
  fields: Record<string, string> = {},
): UxError {
  const [title, message, action, retryable] = catalog[code];
  return {
    code,
    title,
    message,
    action,
    retryable,
    severity:
      code === "UNKNOWN_ERROR" || code === "SERVICE_UNAVAILABLE"
        ? "error"
        : "warning",
    fields,
  };
}
export function fromHttpStatus(status: number): UxError {
  return uxError(
    status === 413
      ? "UPLOAD_TOO_LARGE"
      : status === 401
        ? "SESSION_EXPIRED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : status === 409
              ? "CONFLICT"
              : status === 400 || status === 422
                ? "VALIDATION_ERROR"
                : status === 429
                  ? "RATE_LIMITED"
                  : status === 502 || status === 503 || status === 504
                    ? "SERVICE_UNAVAILABLE"
                    : "UNKNOWN_ERROR",
  );
}
export class UxRequestError extends Error {
  constructor(readonly ux: UxError) {
    super(ux.message);
    this.name = "UxRequestError";
  }
}
export function classifyError(error: unknown): UxError {
  if (error instanceof UxRequestError) return error.ux;
  if (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  )
    return uxError("REQUEST_TIMEOUT");
  // A generic TypeError is not proof of a network failure; classify at the fetch boundary.
  return uxError("UNKNOWN_ERROR");
}
/** Explicitly allowlisted field names; discard backend text and arbitrary object keys. */
export function validationFields(
  payload: unknown,
  allowed: readonly string[],
): Record<string, string> {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("message" in payload) ||
    !Array.isArray(payload.message)
  )
    return {};
  const result: Record<string, string> = {};
  for (const field of allowed) {
    if (!/^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(field)) continue;
    if (
      payload.message.some(
        (entry: unknown) =>
          typeof entry === "string" && entry.startsWith(`${field} `),
      )
    )
      result[field] = "Check this field's value.";
  }
  return result;
}
/** Only controlled page labels; no URL, query string, response body or error.message. */
export function safeDiagnostics(
  error: UxError,
  page: "Tasks" | "Calendar" | "Files" | "People" | "Reports" | "ANTARA ERP",
  now = new Date(),
): string {
  return `ANTARA ERP\nError code: ${error.code}\nTime: ${now.toISOString()}\nPage: ${page}`;
}
