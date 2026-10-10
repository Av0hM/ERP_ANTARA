import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { buildActorContext } from "../../common/authorization/authorization.policy";
import { CreateInvitationDto } from "./invitations.dto";
import { canInviteAccess, normalizeInvitation } from "./invitation-access";

describe("Unified invitation grants", () => {
  it.each([
    ["OWNER", null, "OWNER", []],
    ["MEMBER", null, "MEMBER", []],
    [
      "MEMBER",
      "adcs",
      "MEMBER",
      [{ subsystemId: "adcs", accessLevel: "MEMBER" }],
    ],
    [
      "ADMIN",
      "adcs",
      "MEMBER",
      [{ subsystemId: "adcs", accessLevel: "ADMIN" }],
    ],
  ] as const)(
    "normalizes legacy %s/%s",
    (role, subsystemId, globalRole, memberships) => {
      expect(normalizeInvitation({ role, subsystemId, grants: [] })).toEqual({
        globalRole,
        memberships,
      });
    },
  );
  it("prefers relational grants and rejects malformed legacy ADMIN", () => {
    const grants = [{ subsystemId: "payload", accessLevel: "ADMIN" as const }];
    expect(
      normalizeInvitation({ role: "MEMBER", subsystemId: "adcs", grants })
        .memberships,
    ).toEqual(grants);
    expect(() =>
      normalizeInvitation({ role: "ADMIN", subsystemId: null, grants: [] }),
    ).toThrow();
    expect(() =>
      normalizeInvitation({ role: "OWNER", subsystemId: null, grants }),
    ).toThrow();
  });
  it.each([
    { globalRole: "ADMIN", memberships: [] },
    { globalRole: "MEMBER", memberships: [null] },
    {
      globalRole: "MEMBER",
      memberships: [{ subsystemId: "a", accessLevel: "OWNER" }],
    },
    {
      globalRole: "MEMBER",
      memberships: [
        { subsystemId: "a", accessLevel: "MEMBER" },
        { subsystemId: "a", accessLevel: "ADMIN" },
      ],
    },
    { role: "OWNER", subsystemId: "a" },
    { globalRole: "MEMBER", memberships: [], invitedById: "owner" },
  ])("rejects crafted external DTO %j", async (input) => {
    expect(
      await validate(
        plainToInstance(CreateInvitationDto, {
          email: "test@example.invalid",
          ...input,
        }),
        { whitelist: true, forbidNonWhitelisted: true },
      ),
    ).not.toHaveLength(0);
  });
  it("pending identities have no authority even if a corrupted record claims OWNER", () => {
    const actor = buildActorContext("pending", {
      id: "pending",
      role: "OWNER",
      onboardingPending: true,
      isActive: true,
      deletedAt: null,
      memberships: [],
    });
    expect(actor.globalAuthority).toBe(false);
    expect(
      canInviteAccess(actor, { globalRole: "OWNER", memberships: [] }),
    ).toBe(false);
  });
  it("all grants must be authorized; mixed ADMIN/MEMBER membership does not permit MEMBER-only grants", () => {
    const actor = buildActorContext("admin", {
      id: "admin",
      role: "ADMIN",
      isActive: true,
      deletedAt: null,
      memberships: [
        { subsystemId: "a", accessLevel: "ADMIN" },
        { subsystemId: "b", accessLevel: "MEMBER" },
      ],
    });
    expect(
      canInviteAccess(actor, {
        globalRole: "MEMBER",
        memberships: [{ subsystemId: "a", accessLevel: "MEMBER" }],
      }),
    ).toBe(true);
    expect(
      canInviteAccess(actor, {
        globalRole: "MEMBER",
        memberships: [
          { subsystemId: "a", accessLevel: "MEMBER" },
          { subsystemId: "b", accessLevel: "MEMBER" },
        ],
      }),
    ).toBe(false);
  });
});
