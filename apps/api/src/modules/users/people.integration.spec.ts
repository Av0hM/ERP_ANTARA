import { cpSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { SessionService } from "../../common/sessions/session.service";
import { AccountLifecycleService } from "./account-lifecycle.service";
import { PeopleService } from "./people.service";
import { InvitationsService } from "../invitations/invitations.service";
import {
  invitationDigest,
  InvitationAccess,
} from "../invitations/invitation-access";
import { AuthService } from "../auth/auth.service";
import { GoogleIdentityService } from "../auth/google-identity.service";
import { requireLocalDatabaseUrl } from "../../scripts/local-database-url";
import { provisionCanonicalSubsystems } from "../../scripts/provision-canonical-subsystems";
import { Queue } from "bullmq";

const raw = process.env.AUTH_TEST_DATABASE_URL;
const suite = raw ? describe : describe.skip;
suite("People management: isolated PostgreSQL", () => {
  let db: PrismaService, root: PrismaService, folder: string, schema: string;
  let authz: AuthorizationService,
    sessions: SessionService,
    people: PeopleService,
    invites: InvitationsService,
    auth: AuthService,
    google: GoogleIdentityService;
  let adcs: string, payload: string;
  const config = new ConfigService({
    auth: { accessSecret: "people-isolated-test-secret" },
    FRONTEND_URL: "http://localhost:3105",
  });
  const add = jest.fn();
  const queue: Pick<Queue, "add"> = { add };
  const password = "People#Fixture123";
  const migration = "20261010000000_people_invitation_grants";
  const legacyToken = "legacy-link-before-hashing";
  const source = path.resolve(__dirname, "../../../prisma");
  let legacyBefore: unknown;
  const access = (level: "MEMBER" | "ADMIN" = "MEMBER"): InvitationAccess => ({
    globalRole: "MEMBER",
    memberships: [
      { subsystemId: adcs, accessLevel: level },
      { subsystemId: payload, accessLevel: "MEMBER" },
    ],
  });
  const email = (id: string) => `${id}@people.invalid`;
  const invite = (id: string, grants = access()) =>
    invites.createInvitation(email(id), grants, "owner");
  function identity(id: string) {
    jest
      .spyOn(google, "verify")
      .mockResolvedValue({ email: email(id), name: id, avatarUrl: undefined });
  }
  const signin = () =>
    auth.googleCallback({ idToken: "verified-offline-fixture" });
  function deploy(url: string) {
    execFileSync(
      process.execPath,
      [
        require.resolve("prisma/build/index.js"),
        "migrate",
        "deploy",
        "--schema",
        path.join(folder, "schema.prisma"),
      ],
      {
        cwd: folder,
        env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
        stdio: "pipe",
      },
    );
  }
  beforeAll(async () => {
    const url = new URL(requireLocalDatabaseUrl(raw));
    if (url.pathname !== "/antara_phase2_test")
      throw new Error("Dedicated local fixture required");
    root = new PrismaService({ datasources: { db: { url: url.toString() } } });
    schema = `people_${process.pid}_${Date.now()}`;
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    folder = mkdtempSync(path.join(tmpdir(), "antara-people-"));
    cpSync(source, folder, { recursive: true });
    rmSync(path.join(folder, "migrations", migration), { recursive: true });
    deploy(url.toString());
    db = new PrismaService({ datasources: { db: { url: url.toString() } } });
    await db.$executeRaw`INSERT INTO "User" (id, email, name, role, "updatedAt") VALUES ('owner', 'owner@people.invalid', 'Owner', 'OWNER', NOW())`;
    await provisionCanonicalSubsystems(db);
    adcs = (await db.subsystem.findUniqueOrThrow({ where: { key: "ADCS" } }))
      .id;
    payload = (
      await db.subsystem.findUniqueOrThrow({ where: { key: "PAYLOAD" } })
    ).id;
    await db.$executeRaw`INSERT INTO "Invitation" (id, email, role, "subsystemId", token, "invitedById", "expiresAt", "updatedAt") VALUES ('legacy', 'legacy@people.invalid', 'ADMIN', ${adcs}, ${legacyToken}, 'owner', NOW() + INTERVAL '1 day', NOW())`;
    legacyBefore =
      await db.$queryRaw`SELECT row_to_json(i) FROM "Invitation" i WHERE id = 'legacy'`;
    cpSync(
      path.join(source, "migrations", migration),
      path.join(folder, "migrations", migration),
      { recursive: true },
    );
    deploy(url.toString());
    authz = new AuthorizationService(db);
    sessions = new SessionService(db, new JwtService(), config);
    const lifecycle = new AccountLifecycleService(db, authz, sessions);
    people = new PeopleService(db, authz, sessions, lifecycle);
    invites = new InvitationsService(db, config, authz, queue, sessions);
    google = new GoogleIdentityService(config);
    auth = new AuthService(db, sessions, config, google);
    await db.user.create({
      data: {
        id: "admin",
        name: "Scoped Admin",
        email: email("admin"),
        role: "ADMIN",
        memberships: { create: { subsystemId: adcs, accessLevel: "ADMIN" } },
      },
    });
    await db.user.create({
      data: {
        id: "member",
        name: "Member",
        email: email("member"),
        memberships: { create: { subsystemId: adcs, accessLevel: "MEMBER" } },
      },
    });
    await db.user.create({
      data: {
        id: "unrelated",
        name: "Unrelated",
        email: email("unrelated"),
        memberships: {
          create: { subsystemId: payload, accessLevel: "MEMBER" },
        },
      },
    });
  }, 120000);
  afterEach(() => {
    jest.restoreAllMocks();
    add.mockReset();
    config.set("NOTIFICATIONS_EMAIL_ENABLED", "false");
    config.set("GOOGLE_ALLOWED_EMAILS", "");
  });
  afterAll(async () => {
    await db?.$disconnect();
    if (root && schema) {
      await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await root.$disconnect();
    }
    if (folder) rmSync(folder, { recursive: true, force: true });
  });

  it("upgrades six migrations without changing legacy invitation or migration checksums", async () => {
    const after = await db.$queryRaw<
      { row_to_json: Record<string, unknown> }[]
    >`SELECT row_to_json(i) FROM "Invitation" i WHERE id = 'legacy'`;
    expect(
      after.map(({ row_to_json: row }) => {
        const { tokenHash, ...old } = row;
        expect(tokenHash).toBeNull();
        return { row_to_json: old };
      }),
    ).toEqual(legacyBefore);
    const history = await db.$queryRaw<
      { migration_name: string; checksum: string }[]
    >`SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
    expect(history).toHaveLength(7);
    for (const row of history)
      expect(row.checksum).toBe(
        createHash("sha256")
          .update(
            readFileSync(
              path.join(
                source,
                "migrations",
                row.migration_name,
                "migration.sql",
              ),
            ),
          )
          .digest("hex"),
      );
    expect(
      await db.user.findUnique({
        where: { id: "owner" },
        select: { onboardingPending: true },
      }),
    ).toEqual({ onboardingPending: false });
    expect((await invites.validateToken(legacyToken))?.memberships).toEqual([
      { subsystemId: adcs, accessLevel: "ADMIN", name: "ADCS" },
    ]);
    const result = await invites.acceptInvitation(
      legacyToken,
      password,
      "Legacy",
    );
    expect((await authz.loadActorContext(result.userId)).role).toBe("ADMIN");
  });
  it("stores only digest for new invitations, disabled delivery is successful, lists and audits omit credentials", async () => {
    const created = await invite("digest");
    expect(created.emailDelivery.status).toBe("disabled");
    expect(add).not.toHaveBeenCalled();
    expect(created.invitationUrl).toBe(
      `http://localhost:3105/invite/${created.token}`,
    );
    const row = await db.invitation.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.token).toBeNull();
    expect(row.tokenHash).toBe(invitationDigest(created.token));
    const outputs = JSON.stringify([
      await invites.listPendingInvitations("owner", true),
      await db.auditLog.findMany(),
    ]);
    expect(outputs).not.toContain(created.token);
    expect(outputs).not.toContain(row.tokenHash);
    expect(outputs).not.toMatch(/"token"|"tokenHash"/);
  });
  it("queue failure is nonfatal; successful enqueue retains retries and removes credential payloads", async () => {
    config.set("NOTIFICATIONS_EMAIL_ENABLED", "true");
    config.set("RESEND_API_KEY", "offline-fixture");
    config.set("NOTIFICATIONS_FROM_EMAIL", "test@people.invalid");
    add.mockRejectedValueOnce(new Error("offline"));
    const result = await invite("queue-failure");
    expect(result.emailDelivery.status).toBe("unavailable");
    expect(await invites.validateToken(result.token)).not.toBeNull();
    add.mockResolvedValueOnce({});
    expect((await invite("queued")).emailDelivery.status).toBe("queued");
    expect(add).toHaveBeenLastCalledWith(
      "send-email",
      expect.objectContaining({ globalRole: "MEMBER" }),
      expect.objectContaining({
        attempts: 3,
        removeOnComplete: true,
        removeOnFail: true,
      }),
    );
  });
  it("mixed multi-grant acceptance derives ADMIN, preserves stronger existing grant, revokes sessions", async () => {
    const created = await invite("mixed", access("ADMIN"));
    const accepted = await invites.acceptInvitation(
      created.token,
      password,
      "Mixed",
    );
    const actor = await authz.loadActorContext(accepted.userId);
    expect(actor.role).toBe("ADMIN");
    expect(actor.memberships).toHaveLength(2);
    const session = await auth.login({ email: email("mixed"), password });
    const second = await invite("mixed");
    await invites.acceptForAccount(second.token, accepted.userId);
    expect(
      (await authz.loadActorContext(accepted.userId)).administeredSubsystemIds,
    ).toContain(adcs);
    await expect(
      sessions.authenticateAccess(
        new JwtService().verify(session.accessToken, {
          secret: "people-isolated-test-secret",
        }),
      ),
    ).rejects.toThrow();
  });
  it("multiple grant acceptance rolls back identity, memberships, audit and consumption on failure", async () => {
    const created = await invite("rollback", access("ADMIN"));
    jest
      .spyOn(sessions, "revokeAllSessions")
      .mockRejectedValueOnce(new Error("Fixture rollback"));
    await expect(
      invites.acceptInvitation(created.token, password, "Rollback"),
    ).rejects.toThrow("Fixture rollback");
    expect(await db.user.count({ where: { email: email("rollback") } })).toBe(
      0,
    );
    expect(
      await db.invitation.findUnique({
        where: { id: created.id },
        select: { status: true },
      }),
    ).toEqual({ status: "PENDING" });
    expect(
      await db.auditLog.count({
        where: {
          action: "INVITATION_ACCEPTED",
          payload: { path: ["invitationId"], equals: created.id },
        },
      }),
    ).toBe(0);
  });
  it("concurrent multi-grant acceptance has exactly one winner", async () => {
    const created = await invite("race", access("ADMIN"));
    const result = await Promise.allSettled([
      invites.acceptInvitation(created.token, password, "One"),
      invites.acceptInvitation(created.token, password, "Two"),
    ]);
    expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.subsystemMembership.count({
        where: { user: { email: email("race") } },
      }),
    ).toBe(2);
  });
  it("ADMIN sees only scoped people and grants; MEMBER cannot manage", async () => {
    const result = await people.list("admin");
    expect(result.map((u) => u.id)).toContain("member");
    expect(result.map((u) => u.id)).not.toContain("unrelated");
    expect(
      result.every((u) => u.memberships.every((m) => m.subsystemId === adcs)),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(
      /passwordHash|refreshTokenHash|deletedAt|isDummySeed/,
    );
    await expect(people.list("member")).rejects.toThrow();
    await expect(
      people.updateAccess("member", access(), "admin"),
    ).rejects.toThrow();
    await expect(
      invites.createInvitation(email("forbidden"), access(), "admin"),
    ).rejects.toThrow();
    await expect(
      invites.createInvitation(
        email("forbidden"),
        {
          globalRole: "MEMBER",
          memberships: [{ subsystemId: adcs, accessLevel: "ADMIN" }],
        },
        "admin",
      ),
    ).rejects.toThrow();
    await expect(
      invites.createInvitation(
        email("forbidden"),
        { globalRole: "OWNER", memberships: [] },
        "admin",
      ),
    ).rejects.toThrow();
    await expect(
      invites.createInvitation(
        email("scoped"),
        {
          globalRole: "MEMBER",
          memberships: [{ subsystemId: adcs, accessLevel: "MEMBER" }],
        },
        "admin",
      ),
    ).resolves.toMatchObject({ globalRole: "MEMBER" });
  });
  it("OWNER access edits synchronize role, revoke sessions, and audit membership removals", async () => {
    await people.updateAccess("member", access("ADMIN"), "owner");
    expect((await authz.loadActorContext("member")).role).toBe("ADMIN");
    identity("member");
    const session = await signin();
    await people.updateAccess(
      "member",
      { globalRole: "MEMBER", memberships: [] },
      "owner",
    );
    expect((await authz.loadActorContext("member")).role).toBe("MEMBER");
    await expect(
      sessions.authenticateAccess(
        new JwtService().verify(session.accessToken, {
          secret: "people-isolated-test-secret",
        }),
      ),
    ).rejects.toThrow();
    expect(
      await db.auditLog.count({
        where: { entityId: "member", action: "MEMBERSHIP_REMOVED" },
      }),
    ).toBe(2);
  });
  it("access editor cannot remove last OWNER and rollback preserves sessions", async () => {
    identity("owner");
    const session = await signin();
    await expect(
      people.updateAccess("owner", access("ADMIN"), "owner"),
    ).rejects.toThrow();
    expect((await authz.loadActorContext("owner")).role).toBe("OWNER");
    expect((await authz.loadActorContext("owner")).memberships).toHaveLength(0);
    await expect(
      sessions.authenticateAccess(
        new JwtService().verify(session.accessToken, {
          secret: "people-isolated-test-secret",
        }),
      ),
    ).resolves.toBeDefined();
  });
  it.each(["revoked", "expired"])(
    "pending Google identity loses login, refresh and access after invitation %s",
    async (reason) => {
      const created = await invite(`pending-${reason}`);
      identity(`pending-${reason}`);
      const session = await signin();
      const user = await db.user.findUniqueOrThrow({
        where: { id: session.user.id },
        include: { memberships: true },
      });
      expect(user.onboardingPending).toBe(true);
      expect(user.role).toBe("MEMBER");
      expect(user.memberships).toEqual([]);
      expect((await authz.loadActorContext(user.id)).accountStatus).toBe(
        "PENDING",
      );
      await expect(people.list(user.id)).rejects.toThrow();
      if (reason === "revoked")
        await invites.revokeInvitation(created.id, "owner");
      else
        await db.invitation.update({
          where: { id: created.id },
          data: { expiresAt: new Date(0) },
        });
      await expect(signin()).rejects.toThrow("Authentication failed");
      await expect(sessions.refresh(session.refreshToken)).rejects.toThrow();
      await expect(
        sessions.authenticateAccess(
          new JwtService().verify(session.accessToken, {
            secret: "people-isolated-test-secret",
          }),
        ),
      ).rejects.toThrow();
      expect(await db.user.count({ where: { id: user.id } })).toBe(1);
    },
  );
  it("pending Google acceptance clears state atomically; later login needs no allowlist", async () => {
    const created = await invite("pending-accepted", access("ADMIN"));
    identity("pending-accepted");
    const first = await signin();
    await invites.acceptForAccount(created.token, first.user.id);
    expect(
      await db.user.findUnique({
        where: { id: first.user.id },
        select: { onboardingPending: true, role: true },
      }),
    ).toEqual({ onboardingPending: false, role: "ADMIN" });
    await expect(
      sessions.authenticateAccess(
        new JwtService().verify(first.accessToken, {
          secret: "people-isolated-test-secret",
        }),
      ),
    ).rejects.toThrow();
    expect((await signin()).user.role).toBe("ADMIN");
  });
  it("database forbids pending privileged roles or any membership, including reverse transition", async () => {
    const created = await invite("pending-invariant");
    identity("pending-invariant");
    const session = await signin();
    for (const role of ["OWNER", "ADMIN"] as const)
      await expect(
        db.user.update({ where: { id: session.user.id }, data: { role } }),
      ).rejects.toThrow();
    await expect(
      db.subsystemMembership.create({
        data: {
          userId: session.user.id,
          subsystemId: adcs,
          accessLevel: "MEMBER",
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.user.update({
        where: { id: "unrelated" },
        data: { onboardingPending: true },
      }),
    ).rejects.toThrow();
    await invites.revokeInvitation(created.id, "owner");
  });
  it("allowlisted unknown is ordinary MEMBER; unknown uninvited denied", async () => {
    config.set("GOOGLE_ALLOWED_EMAILS", email("emergency"));
    identity("emergency");
    const result = await signin();
    expect(
      await db.user.findUnique({
        where: { id: result.user.id },
        select: { onboardingPending: true, role: true, memberships: true },
      }),
    ).toEqual({ onboardingPending: false, role: "MEMBER", memberships: [] });
    identity("unknown");
    await expect(signin()).rejects.toThrow("Authentication failed");
  });
  it("existing normal account Google login preserves memberships without env; disabled/deleted deny", async () => {
    identity("admin");
    expect((await signin()).user.role).toBe("ADMIN");
    for (const data of [
      { isActive: false },
      { isActive: true, deletedAt: new Date() },
    ]) {
      await db.user.update({ where: { id: "unrelated" }, data });
      identity("unrelated");
      await expect(signin()).rejects.toThrow("Authentication failed");
    }
  });
});
