import type {
  AccessSelection,
  PersonRecord,
  InvitationView,
  InvitationCreated,
} from "@antara/contracts";
import { rejectApiResponse } from "./http-error";
const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
export async function peopleRequest<T>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (response.status === 401 || response.status === 403)
    rejectApiResponse(response.status);
  if (!response.ok) {
    const payload: { message?: string | string[] } = await response
      .json()
      .catch(() => ({}));
    throw new Error(
      response.status >= 500
        ? "The operation could not finish. Please try again."
        : Array.isArray(payload.message)
          ? payload.message.join(". ")
          : (payload.message ?? "The operation could not finish."),
    );
  }
  return response.json() as Promise<T>;
}
export const fetchPeople = (token: string) =>
  peopleRequest<PersonRecord[]>("/users", token);
export const fetchInvitations = (token: string) =>
  peopleRequest<InvitationView[]>("/invitations", token);
export const createInvitation = (
  token: string,
  email: string,
  access: AccessSelection,
) =>
  peopleRequest<InvitationCreated>("/invitations", token, "POST", {
    email,
    ...access,
  });
