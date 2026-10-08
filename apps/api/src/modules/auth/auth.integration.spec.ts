import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { withOwnerQuorum } from "../users/owner-quorum";
import { RateLimitingMiddleware } from "../../common/middleware/rate-limiting.middleware";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import { PrismaClient, Role } from "@prisma/client";
import { Queue } from "bullmq";
import * as bcrypt from "bcryptjs";
import { requireLocalDatabaseUrl } from "../../scripts/local-database-url";
import { provisionCanonicalSubsystems } from "../../scripts/provision-canonical-subsystems";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  SessionService,
  refreshDigest,
} from "../../common/sessions/session.service";
import { AuthService } from "./auth.service";
import { AuthModule } from "./auth.module";
import { GoogleIdentityService } from "./google-identity.service";
import { InvitationsService } from "../invitations/invitations.service";
import { InvitationsController } from "../invitations/invitations.controller";
import { AccountLifecycleService } from "../users/account-lifecycle.service";
import { UsersController } from "../users/users.controller";
import { UsersService } from "../users/users.service";
import { AuditService } from "../audit/audit.service";

const testUrl = process.env.AUTH_TEST_DATABASE_URL;
if (process.env.AUTH_REQUIRE_DB === "true" && !testUrl)
  throw new Error("AUTH_TEST_DATABASE_URL is required");
const integration = testUrl ? describe : describe.skip;
const migrations = [
  "20260921000000_init",
  "20261005000000_dummy_seed_marker",
  "20261006000000_phase_1a_foundation",
  "20261007000000_phase_2_session_security",
  "20261008000000_phase_6_storage",
  "20261009000000_phase_7_ai_jobs",
] as const;
const originalHashes = [
  "83d550d1662edac027948bcf48a8a2b15be300ea1f518e187cf374a6e3b5db52",
  "ab3b732dd94327c491c711ab9b3a20270cde1aafb80d3ff65010bdf6531ec5c3",
  "8df17a3a1c8d9358ca6fb035ea8b6c9ac6d0f97297f72c219d333441ebcda19d",
];

integration("Phase 2 authentication: isolated PostgreSQL", () => {
  let root: PrismaClient;
  let db: PrismaClient;
  let sessions: SessionService;
  let auth: AuthService;
  let invitations: InvitationsService;
  let lifecycle: AccountLifecycleService;
  let authorization: AuthorizationService;
  let google: GoogleIdentityService;
  let app: INestApplication;
  let generalLimiter: RateLimitingMiddleware;
  let origin: string;
  let schema: string;
  let temp: string;
  let url: URL;
  let adcs: string;
  let payload: string;
  let legacyUser: Awaited<ReturnType<PrismaClient["user"]["findUnique"]>>;
  let passwordHash: string;
  let counter = 0;
  const password = "Fixture-Only#12345";
  const config = new ConfigService({
    auth: { accessSecret: "phase2-isolated-fixture-secret" },
    GOOGLE_CLIENT_ID: "fixture-client",
    GOOGLE_ALLOWED_EMAILS:
      "owner@fixture.invalid,new-google@fixture.invalid,admin@fixture.invalid,disabled-google@fixture.invalid,deleted-google@fixture.invalid",
  });
  const jwt = new JwtService();
  const source = path.resolve(__dirname, "../../../prisma");
  const emailQueue: Pick<Queue, "add"> = { add: jest.fn() };

  function deploy(databaseUrl: string) {
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
          DATABASE_URL: databaseUrl,
          DIRECT_URL: databaseUrl,
        },
        stdio: "pipe",
      },
    );
  }
  async function user(
    id: string,
    role: Role = "MEMBER",
    memberships: {
      subsystemId: string;
      accessLevel: "ADMIN" | "MEMBER";
    }[] = [],
  ) {
    return db.user.create({
      data: {
        id,
        email: `${id}@fixture.invalid`,
        name: id,
        role,
        passwordHash,
        memberships: { create: memberships },
      },
    });
  }
  async function login(id: string) {
    return auth.login({ email: `${id}@fixture.invalid`, password });
  }
  function identity(email: string) {
    jest.spyOn(google, "verify").mockResolvedValue({
      email,
      name: "Verified Google",
      avatarUrl: "https://example.invalid/avatar",
    });
  }
  async function post(route: string, body: unknown, accessToken?: string) {
    return fetch(`${origin}${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }
  beforeAll(async () => {
    url = new URL(requireLocalDatabaseUrl(testUrl));
    if (!url.pathname.startsWith("/antara_phase2_test"))
      throw new Error("Use a dedicated antara_phase2_test* local database");
    schema = `phase2_${process.pid}_${Date.now()}`;
    temp = mkdtempSync(path.join(tmpdir(), "antara-phase2-"));
    cpSync(
      path.join(source, "schema.prisma"),
      path.join(temp, "schema.prisma"),
    );
    for (const migration of migrations.slice(0, 3))
      cpSync(
        path.join(source, "migrations", migration),
        path.join(temp, "migrations", migration),
        { recursive: true },
      );
    writeFileSync(
      path.join(temp, "migrations/migration_lock.toml"),
      'provider = "postgresql"\n',
    );
    root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    deploy(url.toString());
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    passwordHash = await bcrypt.hash(password, 4);
    legacyUser = await user("legacy-history", "OWNER");
    await db.auditLog.create({
      data: {
        id: "historical-audit",
        action: "LEGACY",
        entityType: "User",
        entityId: "legacy-history",
        actorId: "legacy-history",
      },
    });
    await db.$executeRaw`INSERT INTO "Session" (id, "refreshToken", "userId", "expiresAt") VALUES ('old-active', 'old-usable-refresh-jwt', 'legacy-history', NOW() + INTERVAL '7 days')`;
    await db.$executeRaw`INSERT INTO "Session" (id, "refreshToken", "userId", "expiresAt", "revokedAt") VALUES ('old-revoked', 'older-refresh-jwt', 'legacy-history', NOW() + INTERVAL '7 days', '2026-01-01'::timestamp)`;
    for (const name of migrations.slice(3))
      cpSync(
        path.join(source, "migrations", name),
        path.join(temp, "migrations", name),
        { recursive: true },
      );
    deploy(url.toString());
    const subsystems = await provisionCanonicalSubsystems(db);
    adcs = subsystems.find((s) => s.key === "ADCS")!.id;
    payload = subsystems.find((s) => s.key === "PAYLOAD")!.id;
    await user("owner", "OWNER");
    await user("admin", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
      { subsystemId: payload, accessLevel: "MEMBER" },
    ]);
    await user("member", "MEMBER", [
      { subsystemId: adcs, accessLevel: "MEMBER" },
    ]);
    authorization = new AuthorizationService(db);
    sessions = new SessionService(db, jwt, config);
    google = new GoogleIdentityService(config);
    auth = new AuthService(db, sessions, config, google);
    invitations = new InvitationsService(
      db,
      config,
      authorization,
      emailQueue,
      sessions,
    );
    lifecycle = new AccountLifecycleService(db, authorization, sessions);
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
        }),
        AuthModule,
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 120 }]),
      ],
      controllers: [InvitationsController, UsersController],
      providers: [
        { provide: InvitationsService, useValue: invitations },
        { provide: AccountLifecycleService, useValue: lifecycle },
        {
          provide: UsersService,
          useValue: new UsersService(
            db as PrismaService,
            new AuditService(
              db as PrismaService,
              new CoreAuthorizationService(db as PrismaService, authorization),
            ),
            new CoreAuthorizationService(db as PrismaService, authorization),
          ),
        },
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(db)
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(GoogleIdentityService)
      .useValue(google)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    generalLimiter = new RateLimitingMiddleware(new ConfigService());
    app.use(generalLimiter.use.bind(generalLimiter));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    origin = `${await app.getUrl()}/api`;
  }, 120000);
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    generalLimiter?.onModuleDestroy();
    await app?.close();
    await db?.$disconnect();
    if (root) {
      if (/^phase2_\d+_\d+$/.test(schema))
        await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
      await root.$disconnect();
    }
    if (temp) rmSync(temp, { recursive: true, force: true });
  });

  it("keeps all existing migration SQL byte-for-byte intact", () => {
    migrations.slice(0, 3).forEach((name, i) =>
      expect(
        createHash("sha256")
          .update(
            readFileSync(
              path.join(source, "migrations", name, "migration.sql"),
            ),
          )
          .digest("hex"),
      ).toBe(originalHashes[i]),
    );
    expect(
      readdirSync(path.join(source, "migrations"))
        .filter((name) => /^\d/.test(name))
        .sort(),
    ).toEqual(migrations);
  });
  it("migrates populated legacy sessions: revoke, scrub, preserve user/audit/history", async () => {
    expect(
      await db.user.findUnique({ where: { id: "legacy-history" } }),
    ).toEqual(legacyUser);
    expect(await db.auditLog.count({ where: { id: "historical-audit" } })).toBe(
      1,
    );
    const rows = await db.session.findMany({
      where: { userId: "legacy-history" },
      orderBy: { id: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(
      rows.every(
        (row) => row.revokedAt !== null && row.refreshTokenHash === null,
      ),
    ).toBe(true);
    expect(rows[1]?.revokedAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    const columns = await db.$queryRaw<
      { column_name: string }[]
    >`SELECT column_name FROM information_schema.columns WHERE table_schema = ${schema} AND table_name = 'Session'`;
    expect(columns.map((c) => c.column_name)).not.toContain("refreshToken");
    await expect(
      auth.refreshSession({ refreshToken: "old-usable-refresh-jwt" }),
    ).rejects.toThrow();
    await expect(
      db.session.create({
        data: { userId: "owner", expiresAt: new Date(Date.now() + 60000) },
      }),
    ).rejects.toThrow();
  });
  it("migrates a clean installation through the full chain", async () => {
    const clean = `${schema}_clean`;
    const cleanUrl = new URL(url);
    cleanUrl.searchParams.set("schema", clean);
    await root.$executeRawUnsafe(`CREATE SCHEMA "${clean}"`);
    const cleanDb = new PrismaClient({
      datasources: { db: { url: cleanUrl.toString() } },
    });
    try {
      deploy(cleanUrl.toString());
      const history = await cleanDb.$queryRaw<
        { migration_name: string }[]
      >`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`;
      expect(history.map((h) => h.migration_name)).toEqual(migrations);
      expect(await cleanDb.user.count()).toBe(0);
      expect(await cleanDb.session.count()).toBe(0);
    } finally {
      await cleanDb.$disconnect();
      await root.$executeRawUnsafe(`DROP SCHEMA "${clean}" CASCADE`);
    }
  }, 120000);

  it.each(["OWNER", "ADMIN", "MEMBER", undefined])(
    "HTTP public registration rejects role %s without creating an account",
    async (role) => {
      const response = await post("/auth/register", {
        email: "public@fixture.invalid",
        name: "Public",
        password,
        role,
      });
      expect(response.status).toBe(403);
      expect(
        await db.user.count({ where: { email: "public@fixture.invalid" } }),
      ).toBe(0);
    },
  );
  it("HTTP plain-email Google identity is rejected", async () => {
    expect(
      (
        await post("/auth/google-callback", {
          email: "owner@fixture.invalid",
          name: "Owner",
        })
      ).status,
    ).toBe(400);
  });

  it.each<Role>(["MEMBER", "ADMIN", "OWNER"])(
    "OWNER invitation establishes %s atomically",
    async (role) => {
      const email = `invite-${role.toLowerCase()}@fixture.invalid`;
      const invite = await invitations.createInvitation(
        email,
        role,
        role === "OWNER" ? undefined : adcs,
        "owner",
      );
      const accepted = await invitations.acceptInvitation(
        invite.token,
        password,
        "Invited User",
      );
      const created = await db.user.findUniqueOrThrow({
        where: { id: accepted.userId },
        include: { memberships: true },
      });
      expect(created.role).toBe(role);
      expect(created.subsystemId).toBeNull();
      expect(created.memberships.map((m) => m.accessLevel)).toEqual(
        role === "OWNER" ? [] : [role],
      );
      expect((await auth.login({ email, password })).user.role).toBe(role);
      expect(
        (
          await db.invitation.findUniqueOrThrow({
            where: { token: invite.token },
          })
        ).status,
      ).toBe("ACCEPTED");
      await expect(
        invitations.acceptInvitation(invite.token, password, "Again"),
      ).rejects.toThrow();
    },
  );
  it("ADMIN can invite MEMBER in ADCS and no other placement/privilege", async () => {
    const invite = await invitations.createInvitation(
      "admin-invited-member@fixture.invalid",
      "MEMBER",
      adcs,
      "admin",
    );
    const result = await invitations.acceptInvitation(
      invite.token,
      password,
      "Member",
    );
    expect(
      await db.subsystemMembership.findUnique({
        where: {
          userId_subsystemId: { userId: result.userId, subsystemId: adcs },
        },
      }),
    ).toMatchObject({ accessLevel: "MEMBER" });
    for (const [role, subsystem] of [
      ["MEMBER", payload],
      ["MEMBER", undefined],
      ["ADMIN", adcs],
      ["OWNER", adcs],
    ] as const) {
      await expect(
        invitations.createInvitation(
          "forbidden@fixture.invalid",
          role,
          subsystem,
          "admin",
        ),
      ).rejects.toThrow("Invitation not permitted");
    }
    await expect(
      invitations.createInvitation(
        "forbidden@fixture.invalid",
        "MEMBER",
        adcs,
        "member",
      ),
    ).rejects.toThrow("Invitation not permitted");
  });
  it("crafted HTTP ADMIN requests cannot invite ADMIN/OWNER/unrelated MEMBER", async () => {
    const session = await login("admin");
    for (const [role, subsystemId] of [
      ["ADMIN", adcs],
      ["OWNER", adcs],
      ["MEMBER", payload],
    ])
      expect(
        (
          await post(
            "/invitations",
            { email: "crafted@fixture.invalid", role, subsystemId },
            session.accessToken,
          )
        ).status,
      ).toBe(403);
    expect(
      (
        await post(
          "/invitations",
          {
            email: "crafted@fixture.invalid",
            role: "MEMBER",
            subsystemId: adcs,
          },
          (await login("member")).accessToken,
        )
      ).status,
    ).toBe(403);
  });
  it("rechecks inviter membership at acceptance; legacy global ADMIN has no grant", async () => {
    await user("temporary-admin", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    const invite = await invitations.createInvitation(
      "revoked-grant@fixture.invalid",
      "MEMBER",
      adcs,
      "temporary-admin",
    );
    await authorization.withMembershipRoleSync("temporary-admin", (tx) =>
      tx.subsystemMembership.deleteMany({
        where: { userId: "temporary-admin" },
      }),
    );
    await expect(
      invitations.acceptInvitation(invite.token, password, "No grant"),
    ).rejects.toThrow("Invitation not permitted");
    expect(
      await db.user.count({
        where: { email: "revoked-grant@fixture.invalid" },
      }),
    ).toBe(0);
    await user("legacy-admin", "ADMIN");
    await expect(
      invitations.createInvitation(
        "no-grant@fixture.invalid",
        "MEMBER",
        adcs,
        "legacy-admin",
      ),
    ).rejects.toThrow();
  });
  it("existing account gains membership without credential overwrite; MEMBER invitation never downgrades ADMIN", async () => {
    const before = await db.user.findUniqueOrThrow({ where: { id: "admin" } });
    const session = await login("admin");
    const invite = await invitations.createInvitation(
      before.email,
      "MEMBER",
      adcs,
      "owner",
    );
    await expect(
      invitations.acceptInvitation(
        invite.token,
        "attacker-password",
        "Attacker",
      ),
    ).rejects.toThrow();
    await invitations.acceptInvitation(
      invite.token,
      password,
      "Ignored replacement",
    );
    const after = await db.user.findUniqueOrThrow({ where: { id: "admin" } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe(before.name);
    expect(after.role).toBe("ADMIN");
    expect(
      (
        await db.subsystemMembership.findUniqueOrThrow({
          where: { userId_subsystemId: { userId: "admin", subsystemId: adcs } },
        })
      ).accessLevel,
    ).toBe("ADMIN");
    await expect(sessions.refresh(session.refreshToken)).rejects.toThrow();
  });
  it("invitation acceptance rolls back new user, membership, role and status on any failure", async () => {
    const invite = await invitations.createInvitation(
      "rollback@fixture.invalid",
      "ADMIN",
      adcs,
      "owner",
    );
    jest
      .spyOn(sessions, "revokeAllSessions")
      .mockRejectedValueOnce(new Error("Injected transaction failure"));
    await expect(
      invitations.acceptInvitation(invite.token, password, "Rollback"),
    ).rejects.toThrow("Injected transaction failure");
    expect(
      await db.user.count({ where: { email: "rollback@fixture.invalid" } }),
    ).toBe(0);
    expect(
      (
        await db.invitation.findUniqueOrThrow({
          where: { token: invite.token },
        })
      ).status,
    ).toBe("PENDING");
  });
  it("concurrent invitation acceptance has exactly one winner", async () => {
    const invite = await invitations.createInvitation(
      "concurrent-invite@fixture.invalid",
      "MEMBER",
      adcs,
      "owner",
    );
    const results = await Promise.allSettled([
      invitations.acceptInvitation(invite.token, password, "One"),
      invitations.acceptInvitation(invite.token, password, "Two"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.user.count({
        where: { email: "concurrent-invite@fixture.invalid" },
      }),
    ).toBe(1);
  });
  it("revoked/expired invitations cannot be accepted; pending lists omit bearer tokens", async () => {
    const revoked = await invitations.createInvitation(
      "revoked-invite@fixture.invalid",
      "MEMBER",
      adcs,
      "owner",
    );
    const row = await db.invitation.findUniqueOrThrow({
      where: { token: revoked.token },
    });
    await invitations.revokeInvitation(row.id, "owner");
    await expect(
      invitations.acceptInvitation(revoked.token, password, "Revoked"),
    ).rejects.toThrow();
    const expired = await invitations.createInvitation(
      "expired-invite@fixture.invalid",
      "MEMBER",
      adcs,
      "owner",
    );
    await db.invitation.update({
      where: { token: expired.token },
      data: { expiresAt: new Date(0) },
    });
    await expect(
      invitations.acceptInvitation(expired.token, password, "Expired"),
    ).rejects.toThrow();
    expect(await invitations.validateToken(expired.token)).toBeNull();
    const unrelated = await invitations.createInvitation(
      "hidden-invite@fixture.invalid",
      "MEMBER",
      payload,
      "owner",
    );
    const hidden = await db.invitation.findUniqueOrThrow({
      where: { token: unrelated.token },
    });
    await expect(
      invitations.revokeInvitation(hidden.id, "admin"),
    ).rejects.toThrow();
    const listed = await invitations.listPendingInvitations("admin");
    expect(
      listed.every(
        (i) => i.subsystemId === adcs && i.role === "MEMBER" && !("token" in i),
      ),
    ).toBe(true);
    expect(await invitations.listPendingInvitations("member")).toEqual([]);
  });

  it("non-allowlisted verified Google email is denied without creating a user", async () => {
    identity("outsider@fixture.invalid");
    await expect(
      auth.googleCallback({ idToken: "verified-fixture" }),
    ).rejects.toThrow("Authentication failed");
    expect(
      await db.user.count({ where: { email: "outsider@fixture.invalid" } }),
    ).toBe(0);
  });
  it.each(["owner", "admin"])(
    "allowlisted Google login preserves %s role and memberships and authenticates API",
    async (id) => {
      const before = await db.user.findUniqueOrThrow({
        where: { id },
        include: { memberships: true },
      });
      identity(before.email);
      const response = await auth.googleCallback({
        idToken: "verified-fixture",
      });
      expect(response.user.role).toBe(before.role);
      const after = await db.user.findUniqueOrThrow({
        where: { id },
        include: { memberships: true },
      });
      expect(after).toEqual(before);
      const me = await fetch(`${origin}/auth/me`, {
        headers: { Authorization: `Bearer ${response.accessToken}` },
      });
      expect(me.status).toBe(200);
      expect(await me.json()).toEqual(response.user);
      expect(JSON.stringify(response)).not.toMatch(
        /passwordHash|refreshTokenHash|deletedAt|isDummySeed/,
      );
    },
  );
  it("new allowlisted Google user becomes active MEMBER without any membership", async () => {
    identity("new-google@fixture.invalid");
    const response = await auth.googleCallback({ idToken: "verified-fixture" });
    const created = await db.user.findUniqueOrThrow({
      where: { id: response.user.id },
      include: { memberships: true },
    });
    expect(created).toMatchObject({
      role: "MEMBER",
      isActive: true,
      passwordHash: null,
      subsystemId: null,
      memberships: [],
    });
  });
  it("authenticated Google-only account accepts only its own invitation without creating a password", async () => {
    identity("new-google@fixture.invalid");
    const response = await auth.googleCallback({ idToken: "verified-fixture" });
    const invite = await invitations.createInvitation(
      "new-google@fixture.invalid",
      "MEMBER",
      adcs,
      "admin",
    );
    const wrongSession = await login("member");
    expect(
      (
        await post(
          "/invitations/accept-existing",
          { token: invite.token },
          wrongSession.accessToken,
        )
      ).status,
    ).toBe(400);
    expect(
      (await post("/invitations/accept-existing", { token: invite.token }))
        .status,
    ).toBe(401);
    const accepted = await post(
      "/invitations/accept-existing",
      { token: invite.token },
      response.accessToken,
    );
    expect(accepted.status).toBe(201);
    const stored = await db.user.findUniqueOrThrow({
      where: { id: response.user.id },
      include: { memberships: true },
    });
    expect(stored.passwordHash).toBeNull();
    expect(stored.role).toBe("MEMBER");
    expect(stored.memberships).toEqual([
      expect.objectContaining({ subsystemId: adcs, accessLevel: "MEMBER" }),
    ]);
    await expect(sessions.refresh(response.refreshToken)).rejects.toThrow();
  });
  it.each(["inactive", "deleted"])(
    "%s credentials account cannot log in or refresh",
    async (state) => {
      const id = `${state}-credentials`;
      await user(id);
      const response = await login(id);
      await db.user.update({
        where: { id },
        data:
          state === "inactive"
            ? { isActive: false }
            : { deletedAt: new Date() },
      });
      await expect(login(id)).rejects.toThrow("Invalid credentials");
      await expect(sessions.refresh(response.refreshToken)).rejects.toThrow();
      expect(
        (
          await fetch(`${origin}/auth/me`, {
            headers: { Authorization: `Bearer ${response.accessToken}` },
          })
        ).status,
      ).toBe(401);
    },
  );
  it.each(["disabled-google", "deleted-google"])(
    "%s account cannot Google login or be silently reactivated",
    async (id) => {
      await user(id);
      await db.user.update({
        where: { id },
        data: id.startsWith("disabled")
          ? { isActive: false }
          : { deletedAt: new Date() },
      });
      const before = await db.user.findUniqueOrThrow({ where: { id } });
      identity(before.email);
      await expect(
        auth.googleCallback({ idToken: "verified-fixture" }),
      ).rejects.toThrow("Authentication failed");
      expect(await db.user.findUniqueOrThrow({ where: { id } })).toEqual(
        before,
      );
    },
  );
  it("wrong password is rejected and dummy accounts are production-disabled", async () => {
    await expect(
      auth.login({
        email: "owner@fixture.invalid",
        password: "wrong-password",
      }),
    ).rejects.toThrow("Invalid credentials");
    await user("dummy-production");
    await db.user.update({
      where: { id: "dummy-production" },
      data: { isDummySeed: true },
    });
    const before = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      await expect(login("dummy-production")).rejects.toThrow(
        "Invalid credentials",
      );
    } finally {
      process.env.NODE_ENV = before;
    }
  });
  it("refresh is digest-only, rotates with one winner, and rejects reuse/expiry", async () => {
    await user("rotate");
    const response = await login("rotate");
    const stored = await db.session.findUniqueOrThrow({
      where: { refreshTokenHash: refreshDigest(response.refreshToken) },
    });
    expect(stored.refreshTokenHash).not.toBe(response.refreshToken);
    expect(JSON.stringify(stored)).not.toContain(response.refreshToken);
    const rotated = await sessions.refresh(response.refreshToken);
    expect(rotated.refreshToken).not.toBe(response.refreshToken);
    await expect(sessions.refresh(response.refreshToken)).rejects.toThrow();
    const race = await Promise.allSettled([
      sessions.refresh(rotated.refreshToken),
      sessions.refresh(rotated.refreshToken),
    ]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await db.session.update({
      where: { id: stored.id },
      data: { expiresAt: new Date(0) },
    });
    const winner = race.find((r) => r.status === "fulfilled");
    if (winner?.status !== "fulfilled")
      throw new Error("Expected rotation winner");
    await expect(sessions.refresh(winner.value.refreshToken)).rejects.toThrow();
  });
  it("logout and explicit revocation invalidate both access and refresh credentials", async () => {
    await user("revoke");
    const a = await login("revoke");
    const b = await login("revoke");
    await auth.logout({ refreshToken: a.refreshToken });
    await expect(sessions.refresh(a.refreshToken)).rejects.toThrow();
    await expect(
      sessions.authenticateAccess(jwt.decode(a.accessToken)),
    ).rejects.toThrow();
    await lifecycle.revokeSessions("revoke", "owner");
    await expect(sessions.refresh(b.refreshToken)).rejects.toThrow();
    await expect(
      sessions.authenticateAccess(jwt.decode(b.accessToken)),
    ).rejects.toThrow();
  });
  it("OWNER-only deactivation preserves authored history/deletedAt and revokes all sessions; reactivation restores none", async () => {
    await user("lifecycle");
    const response = await login("lifecycle");
    await login("lifecycle");
    const task = await db.task.create({
      data: {
        title: "Historical task",
        description: "Preserve authorship",
        priority: "MEDIUM",
        estimatedHours: 1,
        deadline: new Date("2030-01-01"),
        subsystemId: adcs,
        assignedById: "lifecycle",
        assignedToId: "lifecycle",
        tags: [],
        dependencyIds: [],
      },
    });
    const comment = await db.taskComment.create({
      data: {
        taskId: task.id,
        authorId: "lifecycle",
        content: "Historical comment",
      },
    });
    const file = await db.attachment.create({
      data: {
        name: "historical.txt",
        mimeType: "text/plain",
        sizeBytes: 1,
        storageUrl: "https://fixture.invalid/historical",
        taskId: task.id,
        uploadedById: "lifecycle",
        tags: [],
      },
    });
    const decision = await db.decisionRecord.create({
      data: {
        title: "History",
        context: "Context",
        decision: "Decision",
        rationale: "Rationale",
        authorId: "lifecycle",
      },
    });
    const audit = await db.auditLog.create({
      data: {
        action: "HISTORY",
        entityType: "User",
        entityId: "lifecycle",
        actorId: "lifecycle",
      },
    });
    await expect(
      lifecycle.setActive("lifecycle", false, "admin"),
    ).rejects.toThrow();
    await lifecycle.setActive("lifecycle", false, "owner");
    expect(
      await db.session.count({
        where: { userId: "lifecycle", revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await db.user.findUnique({ where: { id: "lifecycle" } }),
    ).toMatchObject({ isActive: false, deletedAt: null });
    expect(
      await db.auditLog.findUnique({ where: { id: audit.id } }),
    ).not.toBeNull();
    expect(await db.task.findUnique({ where: { id: task.id } })).toEqual(task);
    expect(
      await db.taskComment.findUnique({ where: { id: comment.id } }),
    ).toEqual(comment);
    expect(await db.attachment.findUnique({ where: { id: file.id } })).toEqual(
      file,
    );
    expect(
      await db.decisionRecord.findUnique({ where: { id: decision.id } }),
    ).toEqual(decision);
    await expect(login("lifecycle")).rejects.toThrow();
    await lifecycle.setActive("lifecycle", true, "owner");
    await expect(sessions.refresh(response.refreshToken)).rejects.toThrow();
    await expect(login("lifecycle")).resolves.toHaveProperty("accessToken");
    await db.user.update({
      where: { id: "lifecycle" },
      data: { deletedAt: new Date() },
    });
    await expect(
      lifecycle.setActive("lifecycle", true, "owner"),
    ).rejects.toThrow("Deleted accounts");
    const deletedAt = (
      await db.user.findUniqueOrThrow({ where: { id: "lifecycle" } })
    ).deletedAt;
    await lifecycle.setActive("lifecycle", false, "owner");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "lifecycle" } }))
        .deletedAt,
    ).toEqual(deletedAt);
  });
  it("deactivation races cannot leave an active session", async () => {
    await user("race-deactivate");
    await Promise.allSettled([
      login("race-deactivate"),
      lifecycle.setActive("race-deactivate", false, "owner"),
    ]);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "race-deactivate" } }))
        .isActive,
    ).toBe(false);
    expect(
      await db.session.count({
        where: { userId: "race-deactivate", revokedAt: null },
      }),
    ).toBe(0);
  });
  it("deactivation and revocation roll back together if audit fails", async () => {
    await user("deactivate-rollback");
    const response = await login("deactivate-rollback");
    // A concrete DB trigger fails the transaction's audit insert, not a mock outside it.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION fail_phase2_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'ACCOUNT_DEACTIVATED' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER phase2_audit_failure BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_phase2_audit()`,
    );
    try {
      await expect(
        lifecycle.setActive("deactivate-rollback", false, "owner"),
      ).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(
        `DROP TRIGGER phase2_audit_failure ON "AuditLog"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION fail_phase2_audit()`);
    }
    expect(
      (
        await db.user.findUniqueOrThrow({
          where: { id: "deactivate-rollback" },
        })
      ).isActive,
    ).toBe(true);
    await expect(
      sessions.refresh(response.refreshToken),
    ).resolves.toHaveProperty("accessToken");
  });
  it("only OWNER promotes OWNER; demotion derives compatibility from memberships and revokes sessions", async () => {
    await user("promote", "MEMBER");
    const response = await login("promote");
    for (const role of ["ADMIN", "OWNER"] as const)
      await expect(
        lifecycle.updateRole("promote", role, "admin"),
      ).rejects.toThrow();
    await expect(
      lifecycle.updateRole("promote", "OWNER", "member"),
    ).rejects.toThrow();
    await expect(
      lifecycle.updateRole("promote", "ADMIN", "owner"),
    ).rejects.toThrow("Grant subsystem ADMIN");
    expect((await lifecycle.updateRole("promote", "OWNER", "owner")).role).toBe(
      "OWNER",
    );
    await expect(sessions.refresh(response.refreshToken)).rejects.toThrow();
    expect(
      (await lifecycle.updateRole("promote", "MEMBER", "owner")).role,
    ).toBe("MEMBER");
    await user("owner-with-membership", "OWNER", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    expect(
      (await lifecycle.updateRole("owner-with-membership", "MEMBER", "owner"))
        .role,
    ).toBe("ADMIN");
  });
  it("access helpers use current DB identity instead of stale JWT role; legacy sessionless JWT denied", async () => {
    await user("stale-role", "ADMIN");
    const response = await login("stale-role");
    await db.user.update({
      where: { id: "stale-role" },
      data: { role: "MEMBER" },
    });
    expect(
      (await sessions.authenticateAccess(jwt.decode(response.accessToken)))
        .role,
    ).toBe("MEMBER");
    await expect(
      sessions.authenticateAccess({ id: "owner", role: "OWNER" }),
    ).rejects.toThrow();
    await expect(
      sessions.authenticateAccess({
        ...jwt.decode<Record<string, unknown>>(response.accessToken),
        id: "owner",
      }),
    ).rejects.toThrow();
  });
  it("auth-endpoint throttle returns deterministic 429 after its per-route limit", async () => {
    // Dedicated endpoint bucket; other tests do not invoke refresh through HTTP.
    for (let i = 0; i < 20; i++)
      expect(
        (await post("/auth/refresh", { refreshToken: `invalid-${counter++}` }))
          .status,
      ).toBe(401);
    const limited = await post("/auth/refresh", { refreshToken: "invalid" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });
  it("125 valid sessions across 25 users share one proxy IP without sharing the small refresh or general bucket", async () => {
    for (let i = 0; i < 25; i++) {
      const id = `proxy-user-${i}`;
      await user(id);
      for (let j = 0; j < 5; j++) {
        const session = await login(id);
        const response = await post("/auth/refresh", {
          refreshToken: session.refreshToken,
        });
        expect(response.status).toBe(201);
      }
    }
  }, 30000);
  it("HTTP refresh throttles repeated use of one actual credential", async () => {
    const session = await login("member");
    expect(
      (await post("/auth/refresh", { refreshToken: session.refreshToken }))
        .status,
    ).toBe(201);
    for (let i = 1; i < 20; i++)
      expect(
        (await post("/auth/refresh", { refreshToken: session.refreshToken }))
          .status,
      ).toBe(401);
    const limited = await post("/auth/refresh", {
      refreshToken: session.refreshToken,
    });
    expect(limited.status).toBe(429);
    expect(await limited.text()).not.toContain(session.refreshToken);
  });
  it.each(["/auth/login", "/auth/google-callback", "/invitations/accept"])(
    "HTTP %s retains its small IP bucket",
    async (route) => {
      const statuses: number[] = [];
      // Missing fields deliberately avoid provider access/password hashing, but still consume attempts.
      for (let i = 0; i < 21; i++)
        statuses.push((await post(route, {})).status);
      expect(statuses).toContain(400);
      expect(statuses[20]).toBe(429);
    },
  );

  describe("Last active OWNER quorum", () => {
    let originalOwners: { id: string }[];
    let sole: string;
    const activeOwners = {
      role: "OWNER",
      isActive: true,
      deletedAt: null,
    } as const;
    beforeEach(async () => {
      // Test-only fixture isolation in the disposable schema; never release/backfill state.
      originalOwners = await db.user.findMany({
        where: { role: "OWNER" },
        select: { id: true },
      });
      await db.user.updateMany({
        where: { role: "OWNER" },
        data: { role: "MEMBER" },
      });
      sole = `quorum-${counter++}`;
      await user(sole, "OWNER");
    });
    afterEach(async () => {
      await db.user.updateMany({
        where: { role: "OWNER" },
        data: { role: "MEMBER" },
      });
      await db.user.updateMany({
        where: { id: { in: originalOwners.map((u) => u.id) } },
        data: { role: "OWNER" },
      });
    });
    async function second() {
      const id = `quorum-${counter++}`;
      await user(id, "OWNER");
      return id;
    }
    it.each(["demote", "deactivate"])(
      "sole OWNER cannot %s self and all session/audit/account changes roll back",
      async (operation) => {
        const session = await login(sole);
        const before = await db.user.findUniqueOrThrow({ where: { id: sole } });
        const sessionBefore = await db.session.findMany({
          where: { userId: sole },
        });
        const auditBefore = await db.auditLog.findMany({
          where: { actorId: sole },
        });
        const attempt =
          operation === "demote"
            ? lifecycle.updateRole(sole, "MEMBER", sole)
            : lifecycle.setActive(sole, false, sole);
        await expect(attempt).rejects.toMatchObject({
          status: 409,
          response: { code: "LAST_ACTIVE_OWNER" },
        });
        expect(
          await db.user.findUniqueOrThrow({ where: { id: sole } }),
        ).toEqual(before);
        expect(await db.session.findMany({ where: { userId: sole } })).toEqual(
          sessionBefore,
        );
        expect(
          await db.auditLog.findMany({ where: { actorId: sole } }),
        ).toEqual(auditBefore);
        await expect(
          sessions.refresh(session.refreshToken),
        ).resolves.toHaveProperty("accessToken");
      },
    );
    it.each(["demotion", "soft deletion", "deactivation"])(
      "internal helper cannot remove final authority through %s",
      async (operation) => {
        await expect(
          withOwnerQuorum(db, async (tx) => {
            await tx.user.update({
              where: { id: sole },
              data:
                operation === "demotion"
                  ? { role: "MEMBER" }
                  : operation === "soft deletion"
                    ? { deletedAt: new Date() }
                    : { isActive: false },
            });
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: { code: "LAST_ACTIVE_OWNER" },
        });
        expect(await db.user.count({ where: activeOwners })).toBe(1);
      },
    );
    it("HTTP reports an explicit domain conflict", async () => {
      const session = await login(sole);
      const response = await fetch(`${origin}/users/${sole}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({ role: "MEMBER" }),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: "LAST_ACTIVE_OWNER",
      });
    });
    it.each(["inactive", "deleted"])(
      "%s OWNER does not count toward quorum",
      async (state) => {
        const other = await second();
        await db.user.update({
          where: { id: other },
          data:
            state === "inactive"
              ? { isActive: false }
              : { deletedAt: new Date() },
        });
        await expect(
          lifecycle.updateRole(sole, "MEMBER", sole),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
          lifecycle.setActive(sole, false, sole),
        ).rejects.toMatchObject({ status: 409 });
      },
    );
    it.each(["demote", "deactivate"])(
      "with two active OWNERs one may %s and sessions are revoked",
      async (operation) => {
        const other = await second();
        const session = await login(other);
        if (operation === "demote")
          await lifecycle.updateRole(other, "MEMBER", sole);
        else await lifecycle.setActive(other, false, sole);
        expect(await db.user.count({ where: activeOwners })).toBe(1);
        await expect(sessions.refresh(session.refreshToken)).rejects.toThrow();
        await expect(
          sessions.authenticateAccess(jwt.decode(session.accessToken)),
        ).rejects.toThrow();
      },
    );
    it.each([
      ["demote", "demote"],
      ["deactivate", "deactivate"],
      ["demote", "deactivate"],
    ])(
      "concurrent %s/%s of final two owners has only one winner",
      async (first, last) => {
        const other = await second();
        const change = (id: string, operation: string) =>
          operation === "demote"
            ? lifecycle.updateRole(id, "MEMBER", id)
            : lifecycle.setActive(id, false, id);
        const result = await Promise.allSettled([
          change(sole, first),
          change(other, last),
        ]);
        expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rejected = result.find((r) => r.status === "rejected");
        expect(rejected).toMatchObject({
          status: "rejected",
          reason: { status: 409, response: { code: "LAST_ACTIVE_OWNER" } },
        });
        expect(await db.user.count({ where: activeOwners })).toBe(1);
      },
    );
    it("holds the quorum lock across the full transaction and the waiter observes the committed owner removal", async () => {
      const other = await second();
      let enteredFirst!: () => void;
      let releaseFirst!: () => void;
      const entered = new Promise<void>((resolve) => {
        enteredFirst = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const first = withOwnerQuorum(db, async (tx) => {
        await tx.user.update({ where: { id: sole }, data: { role: "MEMBER" } });
        enteredFirst();
        await release;
      });
      await entered;
      let secondEntered = false;
      const waiter = withOwnerQuorum(db, async (tx) => {
        secondEntered = true;
        await tx.user.update({
          where: { id: other },
          data: { role: "MEMBER" },
        });
      });
      // Attach rejection handling immediately, even if an assertion below fails.
      const waiterResult = Promise.allSettled([waiter]);
      try {
        let waiting = false;
        const deadline = Date.now() + 2000;
        while (!waiting && !secondEntered && Date.now() < deadline) {
          const locks = await db.$queryRaw<
            { waiting: boolean }[]
          >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 1095652434 AND objid = 1 AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS waiting`;
          waiting = locks[0]?.waiting === true;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        expect(secondEntered).toBe(false);
      } finally {
        releaseFirst();
        await first;
      }
      expect(await waiterResult).toMatchObject([
        { status: "rejected", reason: { status: 409 } },
      ]);
      expect(await db.user.count({ where: activeOwners })).toBe(1);
    });
    it("promotion and OWNER reactivation remain possible without restoring sessions", async () => {
      const target = `quorum-member-${counter++}`;
      await user(target);
      const memberSession = await login(target);
      expect((await lifecycle.updateRole(target, "OWNER", sole)).role).toBe(
        "OWNER",
      );
      await expect(
        sessions.refresh(memberSession.refreshToken),
      ).rejects.toThrow();
      const ownerSession = await login(target);
      await lifecycle.setActive(target, false, sole);
      await lifecycle.setActive(target, true, sole);
      expect(await db.user.count({ where: activeOwners })).toBe(2);
      await expect(
        sessions.refresh(ownerSession.refreshToken),
      ).rejects.toThrow();
      await expect(login(target)).resolves.toHaveProperty("accessToken");
    });
  });
});
