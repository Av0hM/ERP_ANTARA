import type {
  AccessSelection,
  PersonRecord,
  InvitationView,
  InvitationCreated,
} from "@antara/contracts";
import { apiFetch, apiJson, checkApiResponse } from "./http-error";
const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
export async function peopleRequest<T>(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await apiFetch(`${base}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  await checkApiResponse(response, ["email", "name", "skills", "capacity"]);
  return apiJson<T>(response);
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
