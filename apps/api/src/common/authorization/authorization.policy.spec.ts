import type { Role } from "@prisma/client";
import {
  administeredSubsystemIds,
  buildActorContext,
  canGrantGlobalRole,
  canGrantMembership,
  canInviteMemberIntoSubsystem,
  canManageDecision,
  canManageSubsystem,
  canReadDecision,
  canReadSubsystem,
  classifyDecision,
  compatibilityRoleForMemberships,
  readableSubsystemIds,
} from "./authorization.policy";
import type {
  ActorContext,
  ActorMembership,
  DecisionAuthorizationRecord,
} from "./authorization.types";

const keys = ["ADCS", "PAYLOAD", "GROUND_COMMS", "SDM", "MAIN_SATELLITE"];
const adcsAdmin: ActorMembership = {
  subsystemId: "ADCS",
  accessLevel: "ADMIN",
};
const mainMember: ActorMembership = {
  subsystemId: "MAIN_SATELLITE",
  accessLevel: "MEMBER",
};
const adcsMember: ActorMembership = {
  subsystemId: "ADCS",
  accessLevel: "MEMBER",
};
function actor(
  role: Role,
  memberships: ActorMembership[] = [],
  isActive = true,
  deletedAt: Date | null = null,
  id = "actor",
) {
  return buildActorContext(id, { id, role, memberships, isActive, deletedAt });
}
const cases: Array<{
  label: string;
  actor: ActorContext;
  read: string[];
  manage: string[];
  active: boolean;
  owner?: boolean;
}> = [
  {
    label: "OWNER without memberships",
    actor: actor("OWNER"),
    read: keys,
    manage: keys,
    active: true,
    owner: true,
  },
  {
    label: "ADCS ADMIN",
    actor: actor("ADMIN", [adcsAdmin]),
    read: ["ADCS"],
    manage: ["ADCS"],
    active: true,
  },
  {
    label: "mixed ADMIN ADCS MEMBER Main",
    actor: actor("ADMIN", [adcsAdmin, mainMember]),
    read: ["ADCS", "MAIN_SATELLITE"],
    manage: ["ADCS"],
    active: true,
  },
  {
    label: "multi ADMIN",
    actor: actor("ADMIN", [
      adcsAdmin,
      { subsystemId: "PAYLOAD", accessLevel: "ADMIN" },
    ]),
    read: ["ADCS", "PAYLOAD"],
    manage: ["ADCS", "PAYLOAD"],
    active: true,
  },
  {
    label: "second ADCS ADMIN",
    actor: actor("ADMIN", [adcsAdmin], true, null, "second"),
    read: ["ADCS"],
    manage: ["ADCS"],
    active: true,
  },
  {
    label: "single MEMBER",
    actor: actor("MEMBER", [adcsMember]),
    read: ["ADCS"],
    manage: [],
    active: true,
  },
  {
    label: "multi MEMBER",
    actor: actor("MEMBER", [adcsMember, mainMember]),
    read: ["ADCS", "MAIN_SATELLITE"],
    manage: [],
    active: true,
  },
  {
    label: "unassigned MEMBER",
    actor: actor("MEMBER"),
    read: [],
    manage: [],
    active: true,
  },
  {
    label: "unassigned ADMIN",
    actor: actor("ADMIN"),
    read: [],
    manage: [],
    active: true,
  },
  {
    label: "ADMIN with MEMBER membership only",
    actor: actor("ADMIN", [mainMember]),
    read: ["MAIN_SATELLITE"],
    manage: [],
    active: true,
  },
  {
    label: "inconsistent MEMBER plus ADMIN membership",
    actor: actor("MEMBER", [adcsAdmin, mainMember]),
    read: [],
    manage: [],
    active: true,
  },
  ...(["OWNER", "ADMIN", "MEMBER"] as const).map((role) => ({
    label: `inactive ${role}`,
    actor: actor(role, [adcsAdmin], false),
    read: [],
    manage: [],
    active: false,
  })),
  ...(["OWNER", "ADMIN", "MEMBER"] as const).map((role) => ({
    label: `deleted ${role}`,
    actor: actor(role, [adcsAdmin], true, new Date(0)),
    read: [],
    manage: [],
    active: false,
  })),
  {
    label: "unknown",
    actor: buildActorContext("missing", null),
    read: [],
    manage: [],
    active: false,
  },
];

describe.each(cases)(
  "pure policy: $label",
  ({ actor: subject, read, manage, active, owner }) => {
    it.each(keys)("enforces subsystem and grant scope for %s", (id) => {
      expect(canReadSubsystem(subject, id)).toBe(read.includes(id));
      expect(canManageSubsystem(subject, id)).toBe(manage.includes(id));
      expect(canInviteMemberIntoSubsystem(subject, id)).toBe(
        manage.includes(id),
      );
      expect(canGrantMembership(subject, id, "MEMBER")).toBe(
        manage.includes(id),
      );
      expect(canGrantMembership(subject, id, "ADMIN")).toBe(Boolean(owner));
    });
    it.each(["OWNER", "ADMIN", "MEMBER"] as const)(
      "global role grant %s is OWNER-only",
      (role) => {
        expect(canGrantGlobalRole(subject, role)).toBe(Boolean(owner));
      },
    );
    it("returns explicit scope sets, never an ambiguous empty global list", () => {
      expect(readableSubsystemIds(subject)).toEqual(
        owner ? { kind: "GLOBAL" } : { kind: "SCOPED", ids: [...read].sort() },
      );
      expect(administeredSubsystemIds(subject)).toEqual(
        owner
          ? { kind: "GLOBAL" }
          : { kind: "SCOPED", ids: [...manage].sort() },
      );
      expect(canManageSubsystem(subject, "")).toBe(false);
      expect(canReadSubsystem(subject, "")).toBe(false);
    });
    it("enforces every nullable scope/authority combination without inventing legacy semantics", () => {
      for (const scope of [null, "GLOBAL", "SUBSYSTEM"] as const) {
        for (const authority of [null, "OWNER", "SUBSYSTEM_ADMIN"] as const) {
          for (const subsystemId of [null, ...keys]) {
            const decision: DecisionAuthorizationRecord = {
              scope,
              authority,
              subsystemId,
            };
            const global =
              scope === "GLOBAL" &&
              authority === "OWNER" &&
              subsystemId === null;
            const subsystem =
              scope === "SUBSYSTEM" &&
              authority !== null &&
              subsystemId !== null;
            expect(canReadDecision(subject, decision)).toBe(
              active && (global || (subsystem && read.includes(subsystemId))),
            );
            expect(canManageDecision(subject, decision)).toBe(
              active &&
                (global || subsystem) &&
                (Boolean(owner) ||
                  (subsystem &&
                    authority === "SUBSYSTEM_ADMIN" &&
                    manage.includes(subsystemId))),
            );
          }
        }
      }
    });
  },
);

describe("context classification and compatibility roles", () => {
  it("flags inconsistent MEMBER administration and ADMIN with no administration", () => {
    expect(actor("MEMBER", [adcsAdmin]).roleInconsistency).toBe(
      "MEMBER_WITH_ADMIN_MEMBERSHIP",
    );
    expect(actor("ADMIN").roleInconsistency).toBe(
      "ADMIN_WITHOUT_ADMIN_MEMBERSHIP",
    );
    expect(actor("OWNER").roleInconsistency).toBeNull();
  });
  it("represents legacy and contradictory decisions explicitly as UNKNOWN", () => {
    expect(
      classifyDecision({ scope: null, authority: null, subsystemId: "ADCS" }),
    ).toEqual({ kind: "UNKNOWN", reason: "LEGACY_METADATA" });
    expect(
      classifyDecision({
        scope: "GLOBAL",
        authority: "SUBSYSTEM_ADMIN",
        subsystemId: null,
      }),
    ).toEqual({ kind: "UNKNOWN", reason: "INVALID_METADATA" });
  });
  it.each(["OWNER", "ADMIN", "MEMBER"] as const)(
    "derives the future compatibility role for %s",
    (role) => {
      expect(compatibilityRoleForMemberships(role, [])).toBe(
        role === "OWNER" ? "OWNER" : "MEMBER",
      );
      expect(compatibilityRoleForMemberships(role, [adcsAdmin])).toBe(
        role === "OWNER" ? "OWNER" : "ADMIN",
      );
      expect(compatibilityRoleForMemberships(role, [mainMember])).toBe(
        role === "OWNER" ? "OWNER" : "MEMBER",
      );
    },
  );
  it("copies/freezes context data so mutable source arrays do not change an evaluation", () => {
    const memberships = [adcsAdmin];
    const context = actor("ADMIN", memberships);
    memberships.length = 0;
    expect(canManageSubsystem(context, "ADCS")).toBe(true);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.memberships)).toBe(true);
  });
});
