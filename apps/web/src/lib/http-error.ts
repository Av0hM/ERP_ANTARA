import {
  fromHttpStatus,
  UxRequestError,
  uxError,
  validationFields,
} from "./ux-error";

export class ApiError extends UxRequestError {
  constructor(
    public readonly status: number,
    fields: Record<string, string> = {},
    domain?: string,
  ) {
    super({
      ...fromHttpStatus(status),
      fields,
      ...(status === 409 && domain === "LAST_ACTIVE_OWNER"
        ? {
            title: "An active OWNER must remain",
            message:
              "This change would remove the final active OWNER. No account changes were saved.",
            action: "Establish another active OWNER before making this change",
          }
        : {}),
    });
  }
}
export function rejectApiResponse(
  status: number,
  fields: Record<string, string> = {},
  domain?: string,
): never {
  if (typeof window !== "undefined" && (status === 401 || status === 403))
    window.dispatchEvent(
      new CustomEvent("antara:access-changed", { detail: status }),
    );
  throw new ApiError(status, fields, domain);
}
export async function checkApiResponse(
  response: Response,
  fields: readonly string[] = [],
): Promise<Response> {
  if (!response.ok) {
    const payload: unknown =
      response.status === 400 ||
      response.status === 422 ||
      response.status === 409
        ? await response.json().catch(() => null)
        : null;
    const domain =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof payload.code === "string"
        ? payload.code
        : undefined;
    rejectApiResponse(
      response.status,
      validationFields(payload, fields),
      domain,
    );
  }
  return response;
}
/** No retries: a lost response does not prove a mutation failed. Uploads keep their own deadline. */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw new UxRequestError(uxError("NETWORK_OFFLINE"));
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30_000),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw new UxRequestError(uxError("REQUEST_TIMEOUT"));
    throw new UxRequestError(
      uxError(
        typeof navigator !== "undefined" && navigator.onLine === false
          ? "NETWORK_OFFLINE"
          : "NETWORK_ERROR",
      ),
    );
  }
  return response;
}

/** A malformed success payload is not a safe UI error message. */
export async function apiJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new UxRequestError(uxError("UNKNOWN_ERROR"));
  }
}
