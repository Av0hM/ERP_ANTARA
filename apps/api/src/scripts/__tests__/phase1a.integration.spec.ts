import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { requireLocalDatabaseUrl } from "../local-database-url";
import { inventoryV1 } from "../v1-preflight-inventory";
import { provisionCanonicalSubsystems } from "../provision-canonical-subsystems";

const rawUrl = process.env.PHASE1A_TEST_DATABASE_URL;
if (process.env.PHASE1A_REQUIRE_DB === "true" && !rawUrl)
  throw new Error("PHASE1A_TEST_DATABASE_URL is required for this gate.");
const integration = rawUrl ? describe : describe.skip;
const apiRoot = path.resolve(__dirname, "../../..");
const migrationNames = [
  "20260921000000_init",
  "20261005000000_dummy_seed_marker",
  "20261006000000_phase_1a_foundation",
];
const tables = [
  "Subsystem",
  "User",
  "Task",
  "CalendarEvent",
  "AIInsight",
  "Invitation",
  "DecisionRecord",
  "AnalyticsSnapshot",
];

integration("Phase 1A local PostgreSQL", () => {
  let clean: PrismaClient;
  let legacy: PrismaClient;
  let cleanUrl: string;
  let legacyUrl: string;
  let root: PrismaClient;
  let temp: string;
  let cleanSchema: string;
  let legacySchema: string;
  let before: Record<string, unknown>;
  let legacyPreflight: Awaited<ReturnType<typeof inventoryV1>>;

  function deploy(url: string, names: string[]) {
    const dir = path.join(temp, names.length === 2 ? "old" : "new");
    mkdirSync(path.join(dir, "migrations"), { recursive: true });
    cpSync(
      path.join(apiRoot, "prisma/schema.prisma"),
      path.join(dir, "schema.prisma"),
    );
    writeFileSync(
      path.join(dir, "migrations/migration_lock.toml"),
      'provider = "postgresql"\n',
    );
    for (const name of names)
      cpSync(
        path.join(apiRoot, "prisma/migrations", name),
        path.join(dir, "migrations", name),
        { recursive: true },
      );
    execFileSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(dir, "schema.prisma"),
      ],
      {
        cwd: temp,
        env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
        stdio: "pipe",
      },
    );
  }

  async function dataSnapshot(db: PrismaClient) {
    const result: Record<string, unknown> = {};
    for (const table of tables) {
      // Fixed test-owned table names only; ignore additive columns when comparing.
      result[table] = await db.$queryRaw<
        Array<{ row: Prisma.JsonValue }>
      >(Prisma.sql`
        SELECT to_jsonb(t) - 'key' - 'scope' - 'authority' AS row
        FROM ${Prisma.raw(`"${table}"`)} t ORDER BY id`);
    }
    // Analytics scope is historical data and must NOT be excluded.
    result.snapshotScopes =
      await db.$queryRaw`SELECT id, scope FROM "AnalyticsSnapshot" ORDER BY id`;
    return result;
  }

  beforeAll(async () => {
    const base = new URL(requireLocalDatabaseUrl(rawUrl));
    if (!base.pathname.startsWith("/antara_phase1a_test"))
      throw new Error("Use a dedicated database named antara_phase1a_test*.");
    temp = mkdtempSync(path.join(tmpdir(), "antara-phase1a-"));
    cleanSchema = `phase1a_clean_${process.pid}_${Date.now()}`;
    legacySchema = cleanSchema.replace("clean", "legacy");
    root = new PrismaClient({ datasources: { db: { url: base.toString() } } });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${cleanSchema}"`);
    await root.$executeRawUnsafe(`CREATE SCHEMA "${legacySchema}"`);
    base.searchParams.set("schema", cleanSchema);
    cleanUrl = base.toString();
    base.searchParams.set("schema", legacySchema);
    legacyUrl = base.toString();
    clean = new PrismaClient({ datasources: { db: { url: cleanUrl } } });
    legacy = new PrismaClient({ datasources: { db: { url: legacyUrl } } });
    deploy(cleanUrl, migrationNames);
    deploy(legacyUrl, migrationNames.slice(0, 2));
    await legacy.$executeRaw`INSERT INTO "Subsystem" (id,name,slug,description,color,"updatedAt") VALUES
      ('software','Software','software','legacy','#000',now()),
      ('avionics','Avionics','avionics','legacy','#000',now()),
      ('structures','Structures','structures','legacy','#000',now()),
      ('thermal','Thermal','thermal','legacy','#000',now()),
      ('communications','Communications','communications','legacy','#000',now()),
      ('ground','Ground Station','ground-station','legacy','#000',now()),
      ('payload','Payload','payload','legacy','#000',now()),
      ('payload-alias',' payload ','old-payload','legacy','#000',now())`;
    await legacy.$executeRaw`INSERT INTO "User" (id,email,name,role,"subsystemId","isActive","deletedAt","updatedAt") VALUES
      ('legacy-admin','admin@fixture.invalid','Fixture Admin','ADMIN','software',true,NULL,now()),
      ('inactive','inactive@fixture.invalid','Inactive','MEMBER','software',false,now(),now()),
      ('unassigned','owner@fixture.invalid','Owner','OWNER',NULL,true,NULL,now())`;
    await legacy.$executeRaw`INSERT INTO "Task" (id,title,description,priority,"estimatedHours",deadline,tags,"dependencyIds","subsystemId","assignedById","updatedAt")
      VALUES ('task','Fixture task','legacy','LOW',1,now(),ARRAY[]::text[],ARRAY[]::text[],'software','legacy-admin',now())`;
    await legacy.$executeRaw`INSERT INTO "CalendarEvent" (id,title,"startsAt","endsAt","subsystemId","updatedAt") VALUES ('event','Fixture',now(),now(),'software',now())`;
    await legacy.$executeRaw`INSERT INTO "AIInsight" (id,title,summary,severity,"riskScore",recommendation,"subsystemId") VALUES ('insight','Fixture','Fixture','INFO',1,'Fixture','software')`;
    await legacy.$executeRaw`INSERT INTO "Invitation" (id,email,role,"subsystemId","invitedById",token,"expiresAt","updatedAt") VALUES ('invite','invite@fixture.invalid','MEMBER','software','legacy-admin','fixture-token',now()+interval '1 day',now())`;
    await legacy.$executeRaw`INSERT INTO "DecisionRecord" (id,title,context,decision,rationale,"authorId","subsystemId","updatedAt") VALUES
      ('decision','Fixture','Fixture','Fixture','Fixture','legacy-admin','software',now()),
      ('global-decision','Global','Fixture','Fixture','Fixture','legacy-admin',NULL,now()),
      ('legacy-payload-decision','Payload','Fixture','Fixture','Fixture','legacy-admin','payload',now())`;
    await legacy.$executeRaw`INSERT INTO "AnalyticsSnapshot" (id,scope,"periodStart","periodEnd","tasksCompleted","avgCompletionHours","overduePercentage","velocityScore",payload)
      VALUES ('snapshot','SUBSYSTEM:software',now(),now(),1,1,0,1,'{"subsystems":[{"name":"Software"}]}')`;
    before = await dataSnapshot(legacy);
    legacyPreflight = await inventoryV1(legacy);
    deploy(legacyUrl, migrationNames);
  }, 120000);

  afterAll(async () => {
    await clean?.$disconnect();
    await legacy?.$disconnect();
    // Only schemas generated by this test, in the guarded dedicated local database.
    if (root) {
      for (const schema of [cleanSchema, legacySchema])
        if (/^phase1a_(clean|legacy)_\d+_\d+$/.test(schema))
          await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await root.$disconnect();
    }
    if (temp) rmSync(temp, { recursive: true, force: true });
  });

  it("deploys the complete migration chain cleanly and preserves populated legacy data", async () => {
    for (const db of [clean, legacy]) {
      const rows = await db.$queryRaw<
        Array<{ migration_name: string }>
      >`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
      expect(rows.map((row) => row.migration_name)).toEqual(migrationNames);
    }
    expect(await dataSnapshot(legacy)).toEqual(before);
    expect(await legacy.subsystemMembership.count()).toBe(0);
    expect(await legacy.subsystem.count({ where: { key: null } })).toBe(8);
    expect(
      await legacy.decisionRecord.count({
        where: { scope: null, authority: null },
      }),
    ).toBe(3);
  });

  it("provisions exactly five canonical records, is idempotent, and never creates/promotes users", async () => {
    expect(await clean.user.count()).toBe(0);
    await provisionCanonicalSubsystems(clean);
    expect(await clean.user.count()).toBe(0);
    // This fixture intentionally stops at Phase 1A; seed only columns from that schema.
    await clean.$executeRaw`INSERT INTO "User" (id, email, name, role, "updatedAt") VALUES ('member', 'member@fixture.invalid', 'Member', 'MEMBER', NOW())`;
    const member = await clean.user.findUniqueOrThrow({
      where: { id: "member" },
      select: { id: true, role: true },
    });
    const original = await clean.user.findMany({
      omit: { onboardingPending: true },
    });
    const first = await clean.subsystem.findMany({ orderBy: { key: "asc" } });
    await provisionCanonicalSubsystems(clean);
    expect(await clean.subsystem.findMany({ orderBy: { key: "asc" } })).toEqual(
      first,
    );
    expect(first.map(({ key }) => key)).toEqual([
      "ADCS",
      "GROUND_COMMS",
      "MAIN_SATELLITE",
      "PAYLOAD",
      "SDM",
    ]);
    expect(
      await clean.user.findMany({ omit: { onboardingPending: true } }),
    ).toEqual(original);
    expect(member.role).toBe("MEMBER");
  });

  it("refuses ambiguous legacy provisioning atomically without adopting even Payload", async () => {
    await expect(provisionCanonicalSubsystems(legacy)).rejects.toThrow(
      "OWNER-reviewed",
    );
    expect(await dataSnapshot(legacy)).toEqual(before);
    expect(await legacy.subsystem.count({ where: { key: null } })).toBe(8);
  });

  it("supports multiple admins and mixed memberships while rejecting duplicate pairs", async () => {
    const adcs = await clean.subsystem.findUniqueOrThrow({
      where: { key: "ADCS" },
    });
    const main = await clean.subsystem.findUniqueOrThrow({
      where: { key: "MAIN_SATELLITE" },
    });
    await clean.$executeRaw`INSERT INTO "User" (id, email, name, role, "updatedAt") VALUES ('a', 'a@fixture.invalid', 'A', 'ADMIN', NOW()), ('b', 'b@fixture.invalid', 'B', 'ADMIN', NOW())`;
    const a = { id: "a" },
      b = { id: "b" };
    await clean.subsystemMembership.createMany({
      data: [
        { userId: a.id, subsystemId: adcs.id, accessLevel: "ADMIN" },
        { userId: b.id, subsystemId: adcs.id, accessLevel: "ADMIN" },
        { userId: a.id, subsystemId: main.id, accessLevel: "MEMBER" },
      ],
    });
    expect(
      await clean.subsystemMembership.count({
        where: { subsystemId: adcs.id, accessLevel: "ADMIN" },
      }),
    ).toBe(2);
    expect(
      (await clean.subsystemMembership.findMany({ where: { userId: a.id } }))
        .map(({ accessLevel }) => accessLevel)
        .sort(),
    ).toEqual(["ADMIN", "MEMBER"]);
    await expect(
      clean.subsystemMembership.create({
        data: { userId: a.id, subsystemId: adcs.id, accessLevel: "MEMBER" },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
    await expect(
      clean.subsystemMembership.create({
        data: {
          userId: "missing",
          subsystemId: adcs.id,
          accessLevel: "MEMBER",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      clean.subsystemMembership.create({
        data: { userId: a.id, subsystemId: "missing", accessLevel: "MEMBER" },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
    await expect(
      clean.user.delete({ where: { id: a.id }, select: { id: true } }),
    ).rejects.toThrow("SubsystemMembership_userId_fkey");
    await expect(
      clean.subsystem.delete({ where: { id: adcs.id } }),
    ).rejects.toThrow("SubsystemMembership_subsystemId_fkey");
  });

  it("enforces decision placement/authority combinations and restrictive deletion", async () => {
    const author = await clean.user.findFirstOrThrow({ select: { id: true } });
    const payload = await clean.subsystem.findUniqueOrThrow({
      where: { key: "PAYLOAD" },
    });
    const data = {
      title: "Fixture",
      context: "Fixture",
      decision: "Fixture",
      rationale: "Fixture",
      authorId: author.id,
    };
    for (const scope of [null, "GLOBAL", "SUBSYSTEM"] as const) {
      for (const authority of [null, "OWNER", "SUBSYSTEM_ADMIN"] as const) {
        for (const subsystemId of [null, payload.id]) {
          const valid =
            (scope === null && authority === null) ||
            (scope === "GLOBAL" &&
              authority === "OWNER" &&
              subsystemId === null) ||
            (scope === "SUBSYSTEM" &&
              authority !== null &&
              subsystemId !== null);
          const operation = clean.decisionRecord.create({
            data: { ...data, scope, authority, subsystemId },
          });
          if (valid)
            await expect(operation).resolves.toMatchObject({
              scope,
              authority,
              subsystemId,
            });
          else
            await expect(operation).rejects.toThrow(
              "DecisionRecord_scope_authority_check",
            );
        }
      }
    }
    await expect(
      clean.subsystem.delete({ where: { id: payload.id } }),
    ).rejects.toThrow("DecisionRecord_subsystemId_fkey");
    const scoped = await clean.decisionRecord.findFirstOrThrow({
      where: { scope: "SUBSYSTEM" },
    });
    await expect(
      clean.decisionRecord.update({
        where: { id: scoped.id },
        data: { subsystemId: null },
      }),
    ).rejects.toThrow();
    await expect(
      legacy.subsystem.delete({ where: { id: "payload" } }),
    ).rejects.toThrow("DecisionRecord_subsystemId_fkey");
  });

  it("inventories pre/post-expand data under READ ONLY without guessing mappings or exposing secrets", async () => {
    const report = await inventoryV1(legacy);
    expect(report.transactionReadOnly).toBe(true);
    expect(legacyPreflight.transactionReadOnly).toBe(true);
    expect(report.foreignKeys.map((fk) => fk.table).sort()).toEqual([
      "AIInsight",
      "CalendarEvent",
      "DecisionRecord",
      "Invitation",
      "SubsystemMembership",
      "Task",
      "User",
    ]);
    expect(report.subsystems.find(({ id }) => id === "software")).toMatchObject(
      {
        key: null,
        candidateKeysForReviewOnly: [],
        requiresOwnerReview: true,
        counts: {
          "User.subsystemId": 2,
          "Task.subsystemId": 1,
          "CalendarEvent.subsystemId": 1,
          "AIInsight.subsystemId": 1,
          "Invitation.subsystemId": 1,
          "DecisionRecord.subsystemId": 1,
        },
        legacyRoleBreakdown: { OWNER: 0, ADMIN: 1, MEMBER: 1 },
      },
    );
    for (const id of [
      "avionics",
      "structures",
      "thermal",
      "communications",
      "ground",
    ]) {
      expect(
        report.subsystems.find((row) => row.id === id)
          ?.candidateKeysForReviewOnly,
      ).toEqual([]);
    }
    expect(report.duplicateMatches).toEqual([
      { key: "PAYLOAD", subsystemIds: ["payload", "payload-alias"] },
    ]);
    expect(report.pendingInvitations).toHaveLength(1);
    expect(report.usersWithoutSubsystem.map(({ id }) => id)).toEqual([
      "unassigned",
    ]);
    expect(report.inactiveOrDeletedUsers.map(({ id }) => id)).toEqual([
      "inactive",
    ]);
    expect(report.snapshotReferences).toEqual([
      {
        id: "snapshot",
        scope: "SUBSYSTEM:software",
        possibleSubsystemIds: ["software"],
      },
    ]);
    expect(JSON.stringify(report)).not.toContain("fixture-token");
    expect(JSON.stringify(report)).not.toContain("@fixture.invalid");
    expect(await dataSnapshot(legacy)).toEqual(before);
    // Prove PostgreSQL, not just coding convention, rejects writes in this mode.
    await expect(
      legacy.$transaction(async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        await tx.$executeRaw`UPDATE "Subsystem" SET name = 'changed' WHERE id = 'software'`;
      }),
    ).rejects.toThrow();
  });
});
