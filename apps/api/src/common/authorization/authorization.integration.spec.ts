import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../../scripts/local-database-url";
import { provisionCanonicalSubsystems } from "../../scripts/provision-canonical-subsystems";
import { AuthorizationService } from "./authorization.service";
import { canManageSubsystem, canReadSubsystem } from "./authorization.policy";

const testUrl = process.env.AUTHORIZATION_TEST_DATABASE_URL;
if (process.env.AUTHORIZATION_REQUIRE_DB === "true" && !testUrl)
  throw new Error("AUTHORIZATION_TEST_DATABASE_URL is required.");
const integration = testUrl ? describe : describe.skip;

integration("Authorization foundation: isolated PostgreSQL", () => {
  let root: PrismaClient;
  let db: PrismaClient;
  let service: AuthorizationService;
  let schema: string;
  let temp: string;
  let adcs: string;
  let payload: string;
  let main: string;

  beforeAll(async () => {
    const url = new URL(requireLocalDatabaseUrl(testUrl));
    if (!url.pathname.startsWith("/antara_phase1b_test"))
      throw new Error("Use a dedicated antara_phase1b_test* local database.");
    schema = `phase1b_${process.pid}_${Date.now()}`;
    temp = mkdtempSync(path.join(tmpdir(), "antara-phase1b-"));
    const source = path.resolve(__dirname, "../../../prisma");
    cpSync(
      path.join(source, "schema.prisma"),
      path.join(temp, "schema.prisma"),
    );
    cpSync(path.join(source, "migrations"), path.join(temp, "migrations"), {
      recursive: true,
    });
    writeFileSync(
      path.join(temp, "migrations/migration_lock.toml"),
      'provider = "postgresql"\n',
    );
    root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    execFileSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(temp, "schema.prisma"),
      ],
      {
        cwd: temp,
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          DIRECT_URL: url.toString(),
        },
        stdio: "pipe",
      },
    );
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    service = new AuthorizationService(db);
    const subsystems = await provisionCanonicalSubsystems(db);
    adcs = subsystems.find(({ key }) => key === "ADCS")!.id;
    payload = subsystems.find(({ key }) => key === "PAYLOAD")!.id;
    main = subsystems.find(({ key }) => key === "MAIN_SATELLITE")!.id;
  }, 120000);

  afterAll(async () => {
    await db?.$disconnect();
    if (root) {
      if (/^phase1b_\d+_\d+$/.test(schema))
        await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await root.$disconnect();
    }
    if (temp) rmSync(temp, { recursive: true, force: true });
  });

  async function createUser(
    id: string,
    role: "OWNER" | "ADMIN" | "MEMBER",
    memberships: Array<{
      subsystemId: string;
      accessLevel: "ADMIN" | "MEMBER";
    }> = [],
  ) {
    return db.user.create({
      data: {
        id,
        name: id,
        email: `${id}@fixture.invalid`,
        role,
        passwordHash: "private-test-hash",
        subsystemId: payload,
        memberships: { create: memberships },
      },
    });
  }

  it("reloads current memberships/roles/account state, independent of stale JWT or legacy subsystem", async () => {
    await createUser("changing", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
      { subsystemId: main, accessLevel: "MEMBER" },
    ]);
    const jwt = { id: "changing", role: "OWNER", subsystemId: payload };
    const initial = await service.loadActorContext(jwt.id);
    expect(canManageSubsystem(initial, adcs)).toBe(true);
    expect(canManageSubsystem(initial, payload)).toBe(false);
    expect(canReadSubsystem(initial, main)).toBe(true);
    expect(canManageSubsystem(initial, main)).toBe(false);
    expect(JSON.stringify(initial)).not.toContain("private-test-hash");
    await db.subsystemMembership.delete({
      where: { userId_subsystemId: { userId: jwt.id, subsystemId: adcs } },
    });
    expect(
      canManageSubsystem(await service.loadActorContext(jwt.id), adcs),
    ).toBe(false);
    await db.user.update({ where: { id: jwt.id }, data: { role: "MEMBER" } });
    expect((await service.loadActorContext(jwt.id)).role).toBe("MEMBER");
    await db.user.update({ where: { id: jwt.id }, data: { isActive: false } });
    expect(canReadSubsystem(await service.loadActorContext(jwt.id), main)).toBe(
      false,
    );
  });

  it("enforces empty query filters against real rows, including global ADMIN without grants", async () => {
    for (const role of ["MEMBER", "ADMIN"] as const) {
      await createUser(`empty-${role}`, role);
      const context = await service.loadActorContext(`empty-${role}`);
      expect(
        await db.subsystem.findMany({
          where: service.subsystemWhere(context, "read"),
        }),
      ).toEqual([]);
      expect(
        await db.subsystem.findMany({
          where: service.subsystemWhere(context, "manage"),
        }),
      ).toEqual([]);
    }
    await createUser("global-owner", "OWNER");
    expect(
      await db.subsystem.count({
        where: service.subsystemWhere(
          await service.loadActorContext("global-owner"),
          "manage",
        ),
      }),
    ).toBe(5);
  });

  it("permits two independent admins and denies inconsistent member/admin state", async () => {
    for (const id of ["admin-one", "admin-two"]) {
      await createUser(id, "ADMIN", [
        { subsystemId: adcs, accessLevel: "ADMIN" },
      ]);
      expect(canManageSubsystem(await service.loadActorContext(id), adcs)).toBe(
        true,
      );
    }
    await createUser("inconsistent", "MEMBER", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    const actor = await service.loadActorContext("inconsistent");
    expect(actor.roleInconsistency).toBe("MEMBER_WITH_ADMIN_MEMBERSHIP");
    expect(
      await db.subsystem.findMany({
        where: service.subsystemWhere(actor, "manage"),
      }),
    ).toEqual([]);
  });

  it("authorizes persisted decision authority and never infers legacy metadata", async () => {
    await createUser("decision-owner", "OWNER");
    await createUser("decision-admin", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    await createUser("decision-member", "MEMBER", [
      { subsystemId: adcs, accessLevel: "MEMBER" },
    ]);
    const base = {
      title: "Fixture",
      context: "Fixture",
      decision: "Fixture",
      rationale: "Fixture",
      authorId: "decision-owner",
    };
    await db.decisionRecord.createMany({
      data: [
        { ...base, id: "global", scope: "GLOBAL", authority: "OWNER" },
        {
          ...base,
          id: "owner-scoped",
          scope: "SUBSYSTEM",
          authority: "OWNER",
          subsystemId: adcs,
        },
        {
          ...base,
          id: "admin-scoped",
          scope: "SUBSYSTEM",
          authority: "SUBSYSTEM_ADMIN",
          subsystemId: adcs,
        },
        {
          ...base,
          id: "unrelated",
          scope: "SUBSYSTEM",
          authority: "SUBSYSTEM_ADMIN",
          subsystemId: payload,
        },
        { ...base, id: "legacy", subsystemId: adcs },
      ],
    });
    for (const userId of [
      "decision-owner",
      "decision-admin",
      "decision-member",
    ]) {
      await expect(
        service.assertDecisionAccess(userId, "global", "read"),
      ).resolves.toHaveProperty("decision.id", "global");
      await expect(
        service.assertDecisionAccess(userId, "owner-scoped", "read"),
      ).resolves.toHaveProperty("decision.id", "owner-scoped");
      await expect(
        service.assertDecisionAccess(userId, "legacy", "manage"),
      ).rejects.toThrow("Decision access denied");
    }
    await expect(
      service.assertDecisionAccess("decision-admin", "owner-scoped", "manage"),
    ).rejects.toThrow("Decision access denied");
    await expect(
      service.assertDecisionAccess("decision-admin", "unrelated", "manage"),
    ).rejects.toThrow("Decision access denied");
    await expect(
      service.assertDecisionAccess("decision-admin", "admin-scoped", "manage"),
    ).resolves.toHaveProperty("decision.id", "admin-scoped");
    await expect(
      service.assertDecisionAccess("decision-member", "admin-scoped", "manage"),
    ).rejects.toThrow("Decision access denied");
    await expect(
      service.assertDecisionAccess("decision-owner", "owner-scoped", "manage"),
    ).resolves.toHaveProperty("decision.id", "owner-scoped");
  });

  it("promotes/downgrades the compatibility role atomically, preserves OWNER, and rolls back failures", async () => {
    await createUser("sync", "MEMBER");
    await service.withMembershipRoleSync("sync", (tx) =>
      tx.subsystemMembership.create({
        data: { userId: "sync", subsystemId: adcs, accessLevel: "ADMIN" },
      }),
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "sync" } })).role,
    ).toBe("ADMIN");
    await expect(
      service.withMembershipRoleSync("sync", async (tx) => {
        await tx.subsystemMembership.deleteMany({ where: { userId: "sync" } });
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "sync" } })).role,
    ).toBe("ADMIN");
    expect(
      await db.subsystemMembership.count({ where: { userId: "sync" } }),
    ).toBe(1);
    await service.withMembershipRoleSync("sync", (tx) =>
      tx.subsystemMembership.deleteMany({ where: { userId: "sync" } }),
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "sync" } })).role,
    ).toBe("MEMBER");
    await createUser("sync-owner", "OWNER", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    await service.withMembershipRoleSync("sync-owner", (tx) =>
      tx.subsystemMembership.deleteMany({ where: { userId: "sync-owner" } }),
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "sync-owner" } })).role,
    ).toBe("OWNER");
    await expect(
      service.withMembershipRoleSync("sync", (tx) =>
        tx.user.update({ where: { id: "sync" }, data: { role: "OWNER" } }),
      ),
    ).rejects.toThrow("must not change");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "sync" } })).role,
    ).toBe("MEMBER");
  });

  it("serializes concurrent membership removals so the last ADMIN grant downgrades correctly", async () => {
    await createUser("concurrent", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
      { subsystemId: payload, accessLevel: "ADMIN" },
    ]);
    await Promise.all(
      [adcs, payload].map((subsystemId) =>
        service.withMembershipRoleSync("concurrent", (tx) =>
          tx.subsystemMembership.delete({
            where: {
              userId_subsystemId: { userId: "concurrent", subsystemId },
            },
          }),
        ),
      ),
    );
    expect(
      await db.subsystemMembership.count({ where: { userId: "concurrent" } }),
    ).toBe(0);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "concurrent" } })).role,
    ).toBe("MEMBER");
  });

  it("does not mutate memberships when the target is missing, inactive or deleted", async () => {
    await createUser("disabled", "OWNER");
    await db.user.update({
      where: { id: "disabled" },
      data: { deletedAt: new Date() },
    });
    const mutate = jest.fn();
    await expect(
      service.withMembershipRoleSync("disabled", mutate),
    ).rejects.toThrow("Account is unavailable");
    await expect(
      service.withMembershipRoleSync("missing", mutate),
    ).rejects.toThrow("Account is unavailable");
    expect(mutate).not.toHaveBeenCalled();
  });
});
