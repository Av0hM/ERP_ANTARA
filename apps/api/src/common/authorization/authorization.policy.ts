import type { MembershipAccessLevel, Role } from "@prisma/client";
import type {
  ActorContext,
  ActorMembership,
  ActorRecord,
  DecisionAuthorization,
  DecisionAuthorizationRecord,
  SubsystemAccess,
} from "./authorization.types";

export function compatibilityRoleForMemberships(
  role: Role,
  memberships: readonly ActorMembership[],
): Role {
  if (role === "OWNER") return "OWNER";
  return memberships.some((membership) => membership.accessLevel === "ADMIN")
    ? "ADMIN"
    : "MEMBER";
}

export function buildActorContext(
  userId: string,
  record: ActorRecord | null,
): ActorContext {
  const memberships = Object.freeze(
    (record?.memberships ?? []).map((membership) =>
      Object.freeze({
        subsystemId: membership.subsystemId,
        accessLevel: membership.accessLevel,
      }),
    ),
  );
  const role = record?.role ?? null;
  const accountStatus = !record
    ? "UNKNOWN"
    : record.deletedAt !== null
      ? "DELETED"
      : !record.isActive
        ? "INACTIVE"
        : record.onboardingPending
          ? "PENDING"
          : "ACTIVE";
  const hasAdmin = memberships.some(
    ({ accessLevel }) => accessLevel === "ADMIN",
  );
  const roleInconsistency =
    role === "MEMBER" && hasAdmin
      ? "MEMBER_WITH_ADMIN_MEMBERSHIP"
      : role === "ADMIN" && !hasAdmin
        ? "ADMIN_WITHOUT_ADMIN_MEMBERSHIP"
        : null;
  const eligible =
    accountStatus === "ACTIVE" &&
    roleInconsistency !== "MEMBER_WITH_ADMIN_MEMBERSHIP";
  return Object.freeze({
    userId: record?.id ?? userId,
    role,
    isActive: record?.isActive ?? false,
    deletedAt: record?.deletedAt?.toISOString() ?? null,
    accountStatus,
    memberships,
    globalAuthority: eligible && role === "OWNER",
    roleInconsistency,
    readableSubsystemIds: Object.freeze(
      eligible
        ? [...new Set(memberships.map(({ subsystemId }) => subsystemId))].sort()
        : [],
    ),
    administeredSubsystemIds: Object.freeze(
      eligible && role === "ADMIN"
        ? [
            ...new Set(
              memberships
                .filter(({ accessLevel }) => accessLevel === "ADMIN")
                .map(({ subsystemId }) => subsystemId),
            ),
          ].sort()
        : [],
    ),
  });
}

export function isActiveActor(actor: ActorContext): boolean {
  return (
    actor.userId.length > 0 &&
    actor.accountStatus === "ACTIVE" &&
    actor.isActive &&
    actor.deletedAt === null &&
    (actor.role === "OWNER" ||
      actor.role === "ADMIN" ||
      actor.role === "MEMBER")
  );
}

function hasConsistentMembershipAuthority(actor: ActorContext): boolean {
  return (
    isActiveActor(actor) &&
    !(
      actor.role === "MEMBER" &&
      actor.memberships.some(({ accessLevel }) => accessLevel === "ADMIN")
    )
  );
}

export function readableSubsystemIds(actor: ActorContext): SubsystemAccess {
  if (!hasConsistentMembershipAuthority(actor))
    return { kind: "SCOPED", ids: [] };
  if (actor.role === "OWNER") return { kind: "GLOBAL" };
  return {
    kind: "SCOPED",
    ids: [
      ...new Set(actor.memberships.map(({ subsystemId }) => subsystemId)),
    ].sort(),
  };
}

export function administeredSubsystemIds(actor: ActorContext): SubsystemAccess {
  if (!hasConsistentMembershipAuthority(actor))
    return { kind: "SCOPED", ids: [] };
  if (actor.role === "OWNER") return { kind: "GLOBAL" };
  return {
    kind: "SCOPED",
    ids:
      actor.role === "ADMIN"
        ? [
            ...new Set(
              actor.memberships
                .filter(({ accessLevel }) => accessLevel === "ADMIN")
                .map(({ subsystemId }) => subsystemId),
            ),
          ].sort()
        : [],
  };
}

function includesSubsystem(
  scope: SubsystemAccess,
  subsystemId: string,
): boolean {
  return (
    subsystemId.length > 0 &&
    (scope.kind === "GLOBAL" || scope.ids.includes(subsystemId))
  );
}
export function canReadSubsystem(
  actor: ActorContext,
  subsystemId: string,
): boolean {
  return includesSubsystem(readableSubsystemIds(actor), subsystemId);
}
export function canManageSubsystem(
  actor: ActorContext,
  subsystemId: string,
): boolean {
  return includesSubsystem(administeredSubsystemIds(actor), subsystemId);
}

export function classifyDecision(
  decision: DecisionAuthorizationRecord,
): DecisionAuthorization {
  if (decision.scope === null || decision.authority === null)
    return { kind: "UNKNOWN", reason: "LEGACY_METADATA" };
  if (
    decision.scope === "GLOBAL" &&
    decision.authority === "OWNER" &&
    decision.subsystemId === null
  )
    return { kind: "GLOBAL", authority: "OWNER" };
  if (
    decision.scope === "SUBSYSTEM" &&
    decision.subsystemId &&
    (decision.authority === "OWNER" || decision.authority === "SUBSYSTEM_ADMIN")
  ) {
    return {
      kind: "SUBSYSTEM",
      authority: decision.authority,
      subsystemId: decision.subsystemId,
    };
  }
  return { kind: "UNKNOWN", reason: "INVALID_METADATA" };
}

export function canReadDecision(
  actor: ActorContext,
  decision: DecisionAuthorizationRecord,
): boolean {
  if (!isActiveActor(actor)) return false;
  const target = classifyDecision(decision);
  if (target.kind === "UNKNOWN") return false;
  return (
    target.kind === "GLOBAL" || canReadSubsystem(actor, target.subsystemId)
  );
}
export function canManageDecision(
  actor: ActorContext,
  decision: DecisionAuthorizationRecord,
): boolean {
  if (!isActiveActor(actor)) return false;
  const target = classifyDecision(decision);
  if (target.kind === "UNKNOWN") return false;
  if (actor.role === "OWNER") return true;
  return (
    target.kind === "SUBSYSTEM" &&
    target.authority === "SUBSYSTEM_ADMIN" &&
    canManageSubsystem(actor, target.subsystemId)
  );
}

export function canGrantMembership(
  actor: ActorContext,
  subsystemId: string,
  accessLevel: MembershipAccessLevel,
): boolean {
  if (accessLevel !== "MEMBER" && accessLevel !== "ADMIN") return false;
  return (
    canManageSubsystem(actor, subsystemId) &&
    (actor.role === "OWNER" || accessLevel === "MEMBER")
  );
}
export function canInviteMemberIntoSubsystem(
  actor: ActorContext,
  subsystemId: string,
): boolean {
  return canGrantMembership(actor, subsystemId, "MEMBER");
}
export function canGrantGlobalRole(actor: ActorContext, role: Role): boolean {
  return (
    isActiveActor(actor) &&
    actor.role === "OWNER" &&
    (role === "OWNER" || role === "ADMIN" || role === "MEMBER")
  );
}
