import { BadRequestException } from "@nestjs/common";
import { MembershipAccessLevel, Prisma, Role } from "@prisma/client";
import { createHash } from "node:crypto";
import { ActorContext } from "../../common/authorization/authorization.types";
import {
  buildActorContext,
  canGrantGlobalRole,
  canGrantMembership,
} from "../../common/authorization/authorization.policy";
import { actorAuthorizationSelect } from "../../common/authorization/authorization.service";

export type InvitationAccess = {
  globalRole: "MEMBER" | "OWNER";
  memberships: { subsystemId: string; accessLevel: MembershipAccessLevel }[];
};
export const invitationInclude = {
  grants: {
    include: { subsystem: { select: { id: true, name: true, key: true } } },
  },
  subsystem: { select: { id: true, name: true, key: true } },
} satisfies Prisma.InvitationInclude;
export type InvitationRecord = Prisma.InvitationGetPayload<{
  include: typeof invitationInclude;
}>;
export function normalizeInvitation(row: {
  role: Role;
  subsystemId: string | null;
  grants: InvitationAccess["memberships"];
}): InvitationAccess {
  if (row.role === "OWNER") {
    if (row.grants.length)
      throw new BadRequestException("Invalid invitation access");
    return { globalRole: "OWNER", memberships: [] };
  }
  if (row.grants.length)
    return {
      globalRole: "MEMBER",
      memberships: row.grants.map(({ subsystemId, accessLevel }) => ({
        subsystemId,
        accessLevel,
      })),
    };
  if (row.role === "ADMIN" && !row.subsystemId)
    throw new BadRequestException("Invalid invitation access");
  return {
    globalRole: "MEMBER",
    memberships: row.subsystemId
      ? [
          {
            subsystemId: row.subsystemId,
            accessLevel: row.role === "ADMIN" ? "ADMIN" : "MEMBER",
          },
        ]
      : [],
  };
}
export function canInviteAccess(
  actor: ActorContext,
  access: InvitationAccess,
): boolean {
  if (access.globalRole === "OWNER")
    return (
      access.memberships.length === 0 && canGrantGlobalRole(actor, "OWNER")
    );
  if (!access.memberships.length) return canGrantGlobalRole(actor, "MEMBER");
  return access.memberships.every((grant) =>
    canGrantMembership(actor, grant.subsystemId, grant.accessLevel),
  );
}
export const invitationDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function findInvitation(
  tx: Prisma.TransactionClient,
  token: string,
) {
  // New tokens are 32 random bytes. Do not impose that format on historical bearer links.
  if (!token || token.length > 128) return null;
  return (
    (await tx.invitation.findUnique({
      where: { tokenHash: invitationDigest(token) },
      include: invitationInclude,
    })) ??
    tx.invitation.findFirst({
      where: { token, tokenHash: null },
      include: invitationInclude,
    })
  );
}
export async function eligiblePendingInvitation(
  tx: Prisma.TransactionClient,
  email: string,
  invitationId?: string,
) {
  const rows = await tx.invitation.findMany({
    where: {
      email,
      ...(invitationId ? { id: invitationId } : {}),
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    include: {
      ...invitationInclude,
      invitedBy: { select: actorAuthorizationSelect },
    },
    orderBy: { id: "asc" },
  });
  return (
    rows.find((row) => {
      try {
        return canInviteAccess(
          buildActorContext(row.invitedById, row.invitedBy),
          normalizeInvitation(row),
        );
      } catch {
        return false;
      }
    }) ?? null
  );
}
export function invitationProjection(row: InvitationRecord) {
  const access = normalizeInvitation(row);
  return {
    id: row.id,
    email: row.email,
    ...access,
    memberships: access.memberships.map((grant) => ({
      ...grant,
      name:
        row.grants.find((g) => g.subsystemId === grant.subsystemId)?.subsystem
          .name ??
        row.subsystem?.name ??
        "Unavailable subsystem",
    })),
    status:
      row.status === "PENDING" && row.expiresAt <= new Date()
        ? "EXPIRED"
        : row.status,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}
