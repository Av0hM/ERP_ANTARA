import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma, PrismaClient, DecisionRecord } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthorizationModule } from "./authorization.module";
import {
  AuthorizationService,
  actorAuthorizationSelect,
  decisionAuthorizationSelect,
} from "./authorization.service";
import { canManageSubsystem, canReadSubsystem } from "./authorization.policy";

type UserFixture = Prisma.UserGetPayload<{ include: { memberships: true } }>;
function user(overrides: Partial<UserFixture> = {}): UserFixture {
  return {
    id: "actor",
    email: "private@fixture.invalid",
    passwordHash: "secret",
    name: "Private",
    avatarUrl: null,
    role: "ADMIN",
    isDummySeed: false,
    onboardingPending: false,
    title: null,
    timezone: "UTC",
    locale: "en",
    availabilityScore: 75,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    deletedAt: null,
    subsystemId: "PAYLOAD",
    skills: [],
    weeklyCapacityHours: 20,
    memberships: [
      {
        userId: "actor",
        subsystemId: "ADCS",
        accessLevel: "ADMIN",
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
    ...overrides,
  };
}
function decision(): DecisionRecord {
  return {
    id: "persisted",
    scope: "SUBSYSTEM",
    authority: "SUBSYSTEM_ADMIN",
    subsystemId: "PAYLOAD",
    title: "Private",
    status: "PROPOSED",
    context: "Private",
    decision: "Private",
    rationale: "Private",
    alternatives: [],
    consequences: null,
    authorId: "someone",
    relatedTaskIds: [],
    supersededById: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    decidedAt: null,
  };
}

describe("AuthorizationService (isolated, no network)", () => {
  const prisma = new PrismaClient({
    datasources: {
      db: { url: "postgresql://localhost/unused_authorization_unit" },
    },
  });
  const service = new AuthorizationService(prisma);
  beforeEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  it("selects only authorization fields and never returns raw user data", async () => {
    const lookup = jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue(user());
    const context = await service.loadActorContext("actor");
    expect(lookup).toHaveBeenCalledWith({
      where: { id: "actor" },
      select: actorAuthorizationSelect,
    });
    expect(actorAuthorizationSelect).toEqual({
      id: true,
      role: true,
      onboardingPending: true,
      isActive: true,
      deletedAt: true,
      memberships: {
        select: { subsystemId: true, accessLevel: true },
        orderBy: { subsystemId: "asc" },
      },
    });
    expect(context).not.toHaveProperty("passwordHash");
    expect(context).not.toHaveProperty("email");
    expect(context).not.toHaveProperty("subsystemId");
    expect(context.memberships).toEqual([
      { subsystemId: "ADCS", accessLevel: "ADMIN" },
    ]);
    expect(canManageSubsystem(context, "PAYLOAD")).toBe(false);
  });

  it("reloads DB state on each call and takes only authenticated identity from JWT", async () => {
    const staleJwt = { id: "actor", role: "OWNER", subsystemId: "PAYLOAD" };
    const lookup = jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce(user())
      .mockResolvedValueOnce(user({ role: "MEMBER", memberships: [] }));
    expect(
      canManageSubsystem(
        await service.loadActorContext(staleJwt.id),
        "PAYLOAD",
      ),
    ).toBe(false);
    const after = await service.loadActorContext(staleJwt.id);
    expect(after.role).toBe("MEMBER");
    expect(canReadSubsystem(after, "ADCS")).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("unknown/empty identity produces a deny-all scope", async () => {
    const lookup = jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue(null);
    const unknown = await service.loadActorContext("missing");
    expect(unknown.accountStatus).toBe("UNKNOWN");
    expect(service.subsystemWhere(unknown, "read")).toEqual({ id: { in: [] } });
    expect(service.subsystemWhere(unknown, "manage")).toEqual({
      id: { in: [] },
    });
    await service.loadActorContext("");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("only valid OWNER produces a global query filter", async () => {
    jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValueOnce(user({ role: "OWNER", memberships: [] }))
      .mockResolvedValueOnce({ ...user(), role: "OWNER", isActive: false });
    expect(
      service.subsystemWhere(await service.loadActorContext("actor"), "read"),
    ).toEqual({});
    expect(
      service.subsystemWhere(await service.loadActorContext("actor"), "read"),
    ).toEqual({ id: { in: [] } });
  });

  it.each([
    { isActive: false, deletedAt: null },
    { isActive: true, deletedAt: new Date() },
  ])("denies invalid account before accessing an object: %s", async (state) => {
    jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue({ ...user(), ...state });
    const lookup = jest.spyOn(prisma.decisionRecord, "findUnique");
    await expect(
      service.assertDecisionAccess("actor", "persisted", "read"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("uses persisted decision placement instead of any caller's claimed scope", async () => {
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue(user());
    const lookup = jest
      .spyOn(prisma.decisionRecord, "findUnique")
      .mockResolvedValue(decision());
    const requestBody = {
      decisionId: "persisted",
      subsystemId: "ADCS",
      authority: "SUBSYSTEM_ADMIN",
    };
    await expect(
      service.assertDecisionAccess("actor", requestBody.decisionId, "manage"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(lookup).toHaveBeenCalledWith({
      where: { id: "persisted" },
      select: decisionAuthorizationSelect,
    });
    expect(decisionAuthorizationSelect).toEqual({
      id: true,
      scope: true,
      authority: true,
      subsystemId: true,
    });
  });

  it("does not invent permissions for legacy decisions, even for OWNER", async () => {
    jest
      .spyOn(prisma.user, "findUnique")
      .mockResolvedValue({ ...user(), role: "OWNER" });
    jest
      .spyOn(prisma.decisionRecord, "findUnique")
      .mockResolvedValue({ ...decision(), scope: null, authority: null });
    await expect(
      service.assertDecisionAccess("actor", "persisted", "manage"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("reports a missing persisted decision and propagates database failures", async () => {
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue(user());
    jest.spyOn(prisma.decisionRecord, "findUnique").mockResolvedValue(null);
    await expect(
      service.assertDecisionAccess("actor", "missing", "read"),
    ).rejects.toBeInstanceOf(NotFoundException);
    jest
      .spyOn(prisma.user, "findUnique")
      .mockRejectedValue(new Error("database unavailable"));
    await expect(service.loadActorContext("actor")).rejects.toThrow(
      "database unavailable",
    );
  });

  it("exports a service through an opt-in Nest module without activating a guard", async () => {
    const module = await Test.createTestingModule({
      imports: [AuthorizationModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    expect(module.get(AuthorizationService)).toBeInstanceOf(
      AuthorizationService,
    );
    await module.close();
  });
});
