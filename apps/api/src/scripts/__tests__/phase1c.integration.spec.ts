import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { bootstrapInitialOwner } from "../v1-owner-bootstrap";
import { provisionCanonicalSubsystems } from "../provision-canonical-subsystems";
import { verifyBootstrap } from "../v1-bootstrap-verification";
import { requireLocalDatabaseUrl } from "../local-database-url";
import { SessionService } from "../../common/sessions/session.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { AccountLifecycleService } from "../../modules/users/account-lifecycle.service";
import { InvitationsService } from "../../modules/invitations/invitations.service";

const raw = process.env.PHASE1C_TEST_DATABASE_URL;
if (process.env.PHASE1C_REQUIRE_DB === "true" && !raw)
  throw new Error("PHASE1C_TEST_DATABASE_URL required");
const integration = raw ? describe : describe.skip;
integration(
  "Phase 1C isolated PostgreSQL bootstrap and subsequent onboarding",
  () => {
    let db: PrismaClient;
    let root: PrismaClient;
    let schema: string;
    let temp: string;
    let sessions: SessionService;
    let auth: AuthorizationService;
    let lifecycle: AccountLifecycleService;
    let invites: InvitationsService;
    const target = "explicit-initial-owner";
    beforeAll(async () => {
      const url = new URL(requireLocalDatabaseUrl(raw));
      if (url.pathname !== "/antara_phase1c_test")
        throw new Error("Dedicated antara_phase1c_test database required");
      root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
      schema = `phase1c_${process.pid}_${Date.now()}`;
      await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
      url.searchParams.set("schema", schema);
      temp = mkdtempSync(path.join(tmpdir(), "antara-phase1c-"));
      cpSync(
        path.resolve(__dirname, "../../../prisma"),
        path.join(temp, "prisma"),
        { recursive: true },
      );
      execFileSync(
        process.execPath,
        [
          require.resolve("prisma/build/index.js"),
          "migrate",
          "deploy",
          "--schema",
          path.join(temp, "prisma/schema.prisma"),
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
      const config = new ConfigService({
        auth: { accessSecret: "phase1c-fixture" },
      });
      sessions = new SessionService(db, new JwtService(), config);
      auth = new AuthorizationService(db);
      lifecycle = new AccountLifecycleService(db, auth, sessions);
      invites = new InvitationsService(
        db,
        config,
        auth,
        { add: jest.fn() },
        sessions,
      );
    }, 120000);
    beforeEach(async () => {
      await db.$executeRaw`TRUNCATE TABLE "User", "Subsystem" CASCADE`;
      await db.user.create({
        data: {
          id: target,
          name: "Synthetic target",
          email: "target@fixture.invalid",
        },
      });
      await db.session.create({
        data: {
          userId: target,
          refreshTokenHash: "a".repeat(64),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
    });
    afterAll(async () => {
      await db?.$disconnect();
      if (root && /^phase1c_\d+_\d+$/.test(schema))
        await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await root?.$disconnect();
      if (temp) rmSync(temp, { recursive: true, force: true });
    });
    it("promotes only the explicit MEMBER, revokes sessions and audits without fabricating memberships or operational data", async () => {
      await db.user.create({
        data: {
          id: "alphabetically-first",
          email: "other@fixture.invalid",
          name: "Other",
        },
      });
      expect(await bootstrapInitialOwner(db, sessions, target)).toEqual({
        userId: target,
        changed: true,
        revokedSessions: 1,
      });
      expect(
        (
          await db.user.findUniqueOrThrow({
            where: { id: "alphabetically-first" },
          })
        ).role,
      ).toBe("MEMBER");
      expect(await db.session.count({ where: { revokedAt: null } })).toBe(0);
      expect(
        await db.auditLog.findFirst({
          where: { action: "INITIAL_OWNER_BOOTSTRAP" },
          select: { actorId: true, entityId: true },
        }),
      ).toEqual({ actorId: target, entityId: target });
      expect(await db.subsystemMembership.count()).toBe(0);
      expect(await db.task.count()).toBe(0);
      expect(await db.decisionRecord.count()).toBe(0);
      expect(await db.invitation.count()).toBe(0);
      expect((await auth.loadActorContext(target)).globalAuthority).toBe(true);
    });
    it.each(["", "missing"])(
      "rejects absent/missing explicit user %s",
      async (id) => {
        await expect(bootstrapInitialOwner(db, sessions, id)).rejects.toThrow();
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: target } })).role,
        ).toBe("MEMBER");
      },
    );
    it.each([{ isActive: false }, { deletedAt: new Date() }])(
      "rejects unavailable target %j",
      async (data) => {
        await db.user.update({ where: { id: target }, data });
        await expect(
          bootstrapInitialOwner(db, sessions, target),
        ).rejects.toThrow();
        expect(await db.auditLog.count()).toBe(0);
      },
    );
    it("rolls role and sessions back if revocation fails", async () => {
      await expect(
        bootstrapInitialOwner(
          db,
          {
            revokeAllSessions: async (id, tx) => {
              await sessions.revokeAllSessions(id, tx);
              throw new Error("fixture failure");
            },
          },
          target,
        ),
      ).rejects.toThrow();
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: target } })).role,
      ).toBe("MEMBER");
      expect(await db.session.count({ where: { revokedAt: null } })).toBe(1);
      expect(await db.auditLog.count()).toBe(0);
    });
    it("rolls everything back on audit insertion failure", async () => {
      await db.$executeRawUnsafe(
        `CREATE FUNCTION "${schema}".reject_audit() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''fixture audit failure''; END'`,
      );
      await db.$executeRaw`CREATE TRIGGER reject_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit()`;
      try {
        await expect(
          bootstrapInitialOwner(db, sessions, target),
        ).rejects.toThrow();
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: target } })).role,
        ).toBe("MEMBER");
        expect(await db.session.count({ where: { revokedAt: null } })).toBe(1);
        expect(await db.auditLog.count()).toBe(0);
      } finally {
        await db.$executeRaw`DROP TRIGGER reject_audit ON "AuditLog"`;
      }
    });
    it("is idempotent without revoking subsequent legitimate sessions or duplicating audit", async () => {
      await bootstrapInitialOwner(db, sessions, target);
      const before = await db.user.findUniqueOrThrow({ where: { id: target } });
      await db.session.create({
        data: {
          userId: target,
          refreshTokenHash: "b".repeat(64),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      expect((await bootstrapInitialOwner(db, sessions, target)).changed).toBe(
        false,
      );
      expect(
        await db.user.findUniqueOrThrow({ where: { id: target } }),
      ).toEqual(before);
      expect(await db.auditLog.count()).toBe(1);
      expect(await db.session.count({ where: { revokedAt: null } })).toBe(1);
    });
    it("allows only one winner among competing initial bootstrap targets", async () => {
      await db.user.create({
        data: { id: "second", email: "second@fixture.invalid", name: "Second" },
      });
      const results = await Promise.allSettled([
        bootstrapInitialOwner(db, sessions, target),
        bootstrapInitialOwner(db, sessions, "second"),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await db.user.count({ where: { role: "OWNER" } })).toBe(1);
    });
    it("preserves ordinary last OWNER protection after zero-to-one bootstrap", async () => {
      await bootstrapInitialOwner(db, sessions, target);
      await expect(
        lifecycle.updateRole(target, "MEMBER", target),
      ).rejects.toThrow();
      await expect(
        lifecycle.setActive(target, false, target),
      ).rejects.toThrow();
      expect((await auth.loadActorContext(target)).globalAuthority).toBe(true);
    });
    it("rehearses the empty baseline with exact idempotent catalog and unchanged migration history", async () => {
      const before = await verifyBootstrap(db, target);
      expect(before.ready).toBe(false);
      await provisionCanonicalSubsystems(db);
      await bootstrapInitialOwner(db, sessions, target);
      const after = await verifyBootstrap(db, target);
      expect(after.ready).toBe(true);
      expect(after.migrations).toEqual(before.migrations);
      expect(after.subsystems.map((s) => s.key).sort()).toEqual([
        "ADCS",
        "GROUND_COMMS",
        "MAIN_SATELLITE",
        "PAYLOAD",
        "SDM",
      ]);
      expect(after.targetMemberships).toEqual([]);
      expect(after.readableSubsystemIds).toHaveLength(5);
      expect(after.counts).toMatchObject({
        users: 1,
        memberships: 0,
        tasks: 0,
        decisions: 0,
        invitations: 0,
        targetUnrevokedSessions: 0,
      });
      await provisionCanonicalSubsystems(db);
      await bootstrapInitialOwner(db, sessions, target);
      expect(await verifyBootstrap(db, target)).toEqual(after);
    });
    it("rejects migration checksum mismatch without changing account state", async () => {
      await db.$executeRaw`UPDATE "_prisma_migrations" SET checksum='mismatch' WHERE migration_name='20260921000000_init'`;
      try {
        await expect(verifyBootstrap(db, target)).rejects.toThrow(
          "MIGRATION_HISTORY_MISMATCH",
        );
        expect(
          (await db.user.findUniqueOrThrow({ where: { id: target } })).role,
        ).toBe("MEMBER");
      } finally {
        await db.$executeRaw`UPDATE "_prisma_migrations" SET checksum='83d550d1662edac027948bcf48a8a2b15be300ea1f518e187cf374a6e3b5db52' WHERE migration_name='20260921000000_init'`;
      }
    });
    it("refuses conflicting catalog data without deleting or changing it", async () => {
      await db.subsystem.create({
        data: {
          name: "Unreviewed",
          slug: "unreviewed",
          description: "fixture",
          color: "#000000",
        },
      });
      await expect(provisionCanonicalSubsystems(db)).rejects.toThrow();
      expect(await db.subsystem.count()).toBe(1);
      expect(await db.user.count()).toBe(1);
    });
    it("supports normal invitations, mixed memberships, multiple admins and compatibility synchronization afterward", async () => {
      await provisionCanonicalSubsystems(db);
      await bootstrapInitialOwner(db, sessions, target);
      const catalog = await db.subsystem.findMany();
      const id = (key: string) => {
        const s = catalog.find((s) => s.key === key);
        if (!s) throw new Error("missing fixture subsystem");
        return s.id;
      };
      async function invite(
        email: string,
        role: "ADMIN" | "MEMBER",
        key: string,
        existingId?: string,
      ) {
        const invitation = await invites.createInvitation(
          email,
          role,
          id(key),
          target,
        );
        return existingId
          ? invites.acceptForAccount(invitation.token, existingId)
          : invites.acceptInvitation(
              invitation.token,
              "Fixture#123456",
              "Synthetic member",
            );
      }
      const member = await invite("member@fixture.invalid", "MEMBER", "ADCS");
      await invite(
        "member@fixture.invalid",
        "MEMBER",
        "MAIN_SATELLITE",
        member.userId,
      );
      const admin = await invite("admin@fixture.invalid", "ADMIN", "PAYLOAD");
      await invite("admin@fixture.invalid", "ADMIN", "ADCS", admin.userId);
      await invite(
        "admin@fixture.invalid",
        "MEMBER",
        "MAIN_SATELLITE",
        admin.userId,
      );
      await invite("admin2@fixture.invalid", "ADMIN", "ADCS");
      expect(
        (await auth.loadActorContext(member.userId)).memberships,
      ).toHaveLength(2);
      const actor = await auth.loadActorContext(admin.userId);
      expect(actor.role).toBe("ADMIN");
      expect(actor.administeredSubsystemIds).toHaveLength(2);
      expect(actor.memberships).toContainEqual({
        subsystemId: id("MAIN_SATELLITE"),
        accessLevel: "MEMBER",
      });
      expect(
        await db.subsystemMembership.count({
          where: { subsystemId: id("ADCS"), accessLevel: "ADMIN" },
        }),
      ).toBe(2);
      await auth.withMembershipRoleSync(admin.userId, (tx) =>
        tx.subsystemMembership.deleteMany({
          where: { userId: admin.userId, accessLevel: "ADMIN" },
        }),
      );
      expect((await auth.loadActorContext(admin.userId)).role).toBe("MEMBER");
      const memberships = await db.subsystemMembership.findMany();
      await provisionCanonicalSubsystems(db);
      expect(await db.subsystemMembership.findMany()).toEqual(memberships);
      expect(await db.user.count()).toBe(4);
      expect((await auth.loadActorContext(target)).memberships).toEqual([]);
    }, 30000);
  },
);
