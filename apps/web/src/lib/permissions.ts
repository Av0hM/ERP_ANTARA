// UI affordances mirror privileged actions; the API remains authoritative.
export function canManageOperations(role: string | null | undefined): boolean {
  return role === "OWNER" || role === "ADMIN";
}
