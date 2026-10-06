import { buildActorContext } from "../../common/authorization/authorization.policy";
import { canInvite } from "./invitation.policy";
import { Role } from "@prisma/client";

function actor(role: Role, admin = false) {
  return buildActorContext("actor", {
    id: "actor",
    role,
    isActive: true,
    deletedAt: null,
    memberships: admin ? [{ subsystemId: "adcs", accessLevel: "ADMIN" }] : [],
  });
}
describe("Invitation policy uses Phase 1B authority", () => {
  it.each<Role>(["MEMBER", "ADMIN", "OWNER"])("OWNER can invite %s", (role) =>
    expect(canInvite(actor("OWNER"), role, "adcs")).toBe(true),
  );
  it("OWNER can invite global OWNER and unassigned MEMBER, but ADMIN needs placement", () => {
    expect(canInvite(actor("OWNER"), "OWNER", undefined)).toBe(true);
    expect(canInvite(actor("OWNER"), "MEMBER", undefined)).toBe(true);
    expect(canInvite(actor("OWNER"), "ADMIN", undefined)).toBe(false);
  });
  it("ADMIN can invite MEMBER only inside administered subsystem", () => {
    expect(canInvite(actor("ADMIN", true), "MEMBER", "adcs")).toBe(true);
    expect(canInvite(actor("ADMIN", true), "MEMBER", "payload")).toBe(false);
    expect(canInvite(actor("ADMIN", true), "MEMBER", undefined)).toBe(false);
  });
  it.each<Role>(["ADMIN", "OWNER"])("ADMIN cannot grant %s", (role) =>
    expect(canInvite(actor("ADMIN", true), role, "adcs")).toBe(false),
  );
  it.each<Role>(["MEMBER", "ADMIN", "OWNER"])(
    "MEMBER cannot invite %s",
    (role) => expect(canInvite(actor("MEMBER"), role, "adcs")).toBe(false),
  );
  it("legacy global ADMIN and inconsistent MEMBER with ADMIN membership fail closed", () => {
    expect(canInvite(actor("ADMIN"), "MEMBER", "adcs")).toBe(false);
    expect(canInvite(actor("MEMBER", true), "MEMBER", "adcs")).toBe(false);
  });
});
