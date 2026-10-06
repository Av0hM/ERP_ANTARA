import type {
  DecisionAuthority,
  DecisionScope,
  MembershipAccessLevel,
  Role,
} from "@prisma/client";

export type ActorMembership = Readonly<{
  subsystemId: string;
  accessLevel: MembershipAccessLevel;
}>;
export type AccountStatus = "ACTIVE" | "INACTIVE" | "DELETED" | "UNKNOWN";
export type RoleInconsistency =
  "MEMBER_WITH_ADMIN_MEMBERSHIP" | "ADMIN_WITHOUT_ADMIN_MEMBERSHIP" | null;

/** Internal snapshot: construct from current DB state, never from request/JWT role claims. */
export interface ActorContext {
  readonly userId: string;
  readonly role: Role | null;
  readonly isActive: boolean;
  readonly deletedAt: string | null;
  readonly accountStatus: AccountStatus;
  readonly memberships: readonly ActorMembership[];
  readonly administeredSubsystemIds: readonly string[];
  readonly readableSubsystemIds: readonly string[];
  readonly globalAuthority: boolean;
  readonly roleInconsistency: RoleInconsistency;
}

/** An empty SCOPED set denies everything. Only GLOBAL permits an unfiltered query. */
export type SubsystemAccess =
  | Readonly<{ kind: "GLOBAL" }>
  | Readonly<{ kind: "SCOPED"; ids: readonly string[] }>;

export interface ActorRecord {
  readonly id: string;
  readonly role: Role;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly memberships: readonly ActorMembership[];
}

export interface DecisionAuthorizationRecord {
  readonly scope: DecisionScope | null;
  readonly authority: DecisionAuthority | null;
  readonly subsystemId: string | null;
}

export type DecisionAuthorization =
  | Readonly<{
      kind: "UNKNOWN";
      reason: "LEGACY_METADATA" | "INVALID_METADATA";
    }>
  | Readonly<{ kind: "GLOBAL"; authority: "OWNER" }>
  | Readonly<{
      kind: "SUBSYSTEM";
      authority: DecisionAuthority;
      subsystemId: string;
    }>;
