import { Test } from "@nestjs/testing";
import { canonicalSubsystems } from "@antara/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { UiContextService } from "./ui-context.service";
import { buildActorContext } from "../../common/authorization/authorization.policy";
import { Role, MembershipAccessLevel, Prisma } from "@prisma/client";

describe("Current UI context presentation", () => {
  async function fixture(
    role: Role,
    memberships: {
      subsystemId: string;
      accessLevel: MembershipAccessLevel;
    }[] = [],
    isActive = true,
  ) {
    const actor = buildActorContext("actor", {
      id: "actor",
      role,
      isActive,
      deletedAt: null,
      memberships,
    });
    const authorization = new AuthorizationService(new PrismaService());
    jest.spyOn(authorization, "loadActorContext").mockResolvedValue(actor);
    const db = {
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
      user: {
        findUniqueOrThrow: jest.fn(async () => ({
          id: "actor",
          name: "Actor",
          role,
          avatarUrl: null,
        })),
      },
      subsystem: {
        findMany: jest.fn(async () =>
          canonicalSubsystems
            .filter(
              (s) =>
                actor.globalAuthority ||
                actor.readableSubsystemIds.includes(s.key),
            )
            .map((s) => ({ id: s.key, key: s.key })),
        ),
      },
      notification: { count: jest.fn(async () => 3) },
    };
    db.$transaction.mockImplementation(
      (callback: (tx: object) => Promise<unknown>) => callback(db),
    );
    const module = await Test.createTestingModule({
      providers: [
        UiContextService,
        { provide: AuthorizationService, useValue: authorization },
        { provide: PrismaService, useValue: db },
      ],
    }).compile();
    return { service: module.get(UiContextService), db };
  }
  it("OWNER has all five and global context without memberships", async () => {
    const { service, db } = await fixture("OWNER");
    const result = await service.get("actor");
    expect(result.contexts).toHaveLength(6);
    expect(result.defaultContextId).toBe("global");
    expect(result.globalAuthority).toBe(true);
    expect(result.permissions.manageOperations).toBe(true);
    expect(db.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "actor" },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        role: true,
      } satisfies Prisma.UserSelect,
    });
    expect(db.notification.count).toHaveBeenCalledWith({
      where: { userId: "actor", isRead: false },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|refreshTokenHash|deletedAt|email|isActive/,
    );
  });
  it("mixed memberships produce distinct administrative/read views", async () => {
    const { service } = await fixture("ADMIN", [
      { subsystemId: "ADCS", accessLevel: "ADMIN" },
      { subsystemId: "PAYLOAD", accessLevel: "MEMBER" },
    ]);
    const result = await service.get("actor");
    expect(result.contexts).toHaveLength(3);
    expect(result.contexts.find((c) => c.key === "ADCS")).toMatchObject({
      view: "ANALYTICS",
      canManage: true,
    });
    expect(result.contexts.find((c) => c.key === "PAYLOAD")).toMatchObject({
      view: "SUBSYSTEM",
      canManage: false,
    });
  });
  it("MEMBER gets personal and only readable scopes", async () => {
    const { service } = await fixture("MEMBER", [
      { subsystemId: "ADCS", accessLevel: "MEMBER" },
    ]);
    const result = await service.get("actor");
    expect(result.defaultContextId).toBe("personal");
    expect(result.contexts).toHaveLength(2);
    expect(result.permissions).toEqual({
      manageOperations: false,
      viewResources: false,
      viewReports: false,
    });
  });
  it.each(["ADMIN", "MEMBER"] as const)(
    "empty %s never becomes global",
    async (role) => {
      const { service } = await fixture(role);
      const result = await service.get("actor");
      expect(result.globalAuthority).toBe(false);
      expect(result.contexts).toHaveLength(1);
      expect(result.permissions.manageOperations).toBe(false);
    },
  );
  it("inconsistent MEMBER does not gain administrative UI", async () => {
    const { service } = await fixture("MEMBER", [
      { subsystemId: "ADCS", accessLevel: "ADMIN" },
    ]);
    expect((await service.get("actor")).contexts).toHaveLength(1);
  });
  it("inactive OWNER is rejected", async () => {
    const { service } = await fixture("OWNER", [], false);
    await expect(service.get("actor")).rejects.toThrow();
  });
});
