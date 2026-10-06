import { Role } from "@prisma/client";
import { ActorContext } from "../../common/authorization/authorization.types";
import {
  canGrantGlobalRole,
  canGrantMembership,
} from "../../common/authorization/authorization.policy";

export function canInvite(
  actor: ActorContext,
  role: Role,
  subsystemId: string | null | undefined,
): boolean {
  if (role === "OWNER") return canGrantGlobalRole(actor, "OWNER");
  if (role !== "ADMIN" && role !== "MEMBER") return false;
  if (!subsystemId)
    return role === "MEMBER" && canGrantGlobalRole(actor, "MEMBER");
  return canGrantMembership(actor, subsystemId, role);
}
