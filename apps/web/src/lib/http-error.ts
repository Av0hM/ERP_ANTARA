export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(
      status === 403
        ? "You no longer have access to this information."
        : status === 401
          ? "Your session has expired. Please sign in again."
          : "Unable to load data. Please try again.",
    );
  }
}
export function rejectApiResponse(status: number): never {
  if (typeof window !== "undefined" && (status === 401 || status === 403))
    window.dispatchEvent(
      new CustomEvent("antara:access-changed", { detail: status }),
    );
  throw new ApiError(status);
}
