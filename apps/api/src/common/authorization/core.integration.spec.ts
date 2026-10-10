import { PeopleService } from "../../modules/users/people.service";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService, lockAccounts } from "../sessions/session.service";
import { RedisCacheService } from "../cache/redis-cache.service";
import { AuthorizationService } from "./authorization.service";
import { CoreAuthorizationService } from "./core-authorization.service";
import { requireLocalDatabaseUrl } from "../../scripts/local-database-url";
import { provisionCanonicalSubsystems } from "../../scripts/provision-canonical-subsystems";
import { JwtStrategy } from "../../modules/auth/strategies/jwt.strategy";
import { TasksController } from "../../modules/tasks/tasks.controller";
import { TasksService } from "../../modules/tasks/tasks.service";
import { TaskEventsService } from "../../modules/tasks/events/task-events.service";
import { SubsystemsController } from "../../modules/subsystems/subsystems.controller";
import { SubsystemsService } from "../../modules/subsystems/subsystems.service";
import { DecisionsController } from "../../modules/decisions/decisions.controller";
import { DecisionsService } from "../../modules/decisions/decisions.service";
import { AnalyticsController } from "../../modules/analytics/analytics.controller";
import {
  AnalyticsService,
  scopeKey,
} from "../../modules/analytics/analytics.service";
import { UsersController } from "../../modules/users/users.controller";
import { UsersService } from "../../modules/users/users.service";
import { AccountLifecycleService } from "../../modules/users/account-lifecycle.service";
import { AuditService } from "../../modules/audit/audit.service";

const testUrl = process.env.CORE_TEST_DATABASE_URL;
if (process.env.CORE_REQUIRE_DB === "true" && !testUrl)
  throw new Error("CORE_TEST_DATABASE_URL required");
const integration = testUrl ? describe : describe.skip;

integration("Phase 4A current DB scoped HTTP and object races", () => {
  let db: PrismaService;
  let root: PrismaClient;
  let app: INestApplication;
  let temp: string;
  let schema: string;
  let origin: string;
  let adcs: string;
  let payload: string;
  let sdm: string;
  let taskA: string;
  let taskP: string;
  let taskS: string;
  let globalDecision: string;
  let ownerDecision: string;
  let adminDecision: string;
  let legacyDecision: string;
  const tokens = new Map<string, string>();
  const values = new Map<string, unknown>();
  const cache = {
    getJson: jest.fn(async (key: string) => values.get(key) ?? null),
    setJson: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
    del: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
  const config = new ConfigService({
    auth: { accessSecret: "phase4a-fixture-secret" },
  });
  const jwt = new JwtService();
  let sessions: SessionService;
  async function user(
    id: string,
    role: Role,
    memberships: {
      subsystemId: string;
      accessLevel: "ADMIN" | "MEMBER";
    }[] = [],
  ) {
    const record = await db.user.create({
      data: {
        id,
        email: `${id}@fixture.invalid`,
        name: id,
        role,
        passwordHash: "secret-fixture-only",
        memberships: { create: memberships },
      },
    });
    const credentials = await db.$transaction(async (tx) => {
      await lockAccounts(tx, [id]);
      return sessions.issue(tx, record);
    });
    tokens.set(id, credentials.accessToken);
    return record;
  }
  function input(subsystemId = adcs) {
    return {
      title: "task",
      description: "fixture",
      subsystemId,
      priority: "HIGH",
      deadline: "2027-01-01T00:00:00Z",
      estimatedHours: 1,
    };
  }
  async function req(
    actor: string,
    route: string,
    method = "GET",
    body?: unknown,
  ) {
    return fetch(`${origin}/api${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokens.get(actor)}`,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  async function ids(actor: string, route: string) {
    const res = await req(actor, route);
    expect(res.status).toBe(200);
    const data: { id: string }[] = await res.json();
    return data.map((item) => item.id);
  }
  const decisionInput = (subsystemId?: string) => ({
    title: "decision",
    context: "context",
    decision: "chosen",
    rationale: "reason",
    ...(subsystemId ? { subsystemId } : {}),
  });
  beforeAll(async () => {
    const url = new URL(requireLocalDatabaseUrl(testUrl));
    if (url.pathname !== "/antara_phase4a_test")
      throw new Error("Use dedicated antara_phase4a_test database");
    schema = `phase4a_${process.pid}_${Date.now()}`;
    root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    temp = mkdtempSync(path.join(tmpdir(), "antara-phase4a-"));
    cpSync(path.resolve(__dirname, "../../../prisma"), temp, {
      recursive: true,
    });
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
    db = new PrismaService({ datasources: { db: { url: url.toString() } } });
    sessions = new SessionService(db, jwt, config);
    const subsystems = await provisionCanonicalSubsystems(db);
    adcs = subsystems.find((s) => s.key === "ADCS")!.id;
    payload = subsystems.find((s) => s.key === "PAYLOAD")!.id;
    sdm = subsystems.find((s) => s.key === "SDM")!.id;
    await user("owner", "OWNER");
    await user("admin", "ADMIN", [{ subsystemId: adcs, accessLevel: "ADMIN" }]);
    await user("admin2", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    await user("mixed", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
      { subsystemId: payload, accessLevel: "MEMBER" },
    ]);
    await user("multi", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
      { subsystemId: payload, accessLevel: "ADMIN" },
    ]);
    await user("member", "MEMBER", [
      { subsystemId: adcs, accessLevel: "MEMBER" },
    ]);
    await user("outsider", "MEMBER", [
      { subsystemId: sdm, accessLevel: "MEMBER" },
    ]);
    await user("empty", "MEMBER");
    await user("empty-admin", "ADMIN");
    for (const [scope, assignedToId, title] of [
      [adcs, "member", "readable-adcs"],
      [payload, "mixed", "payload-private"],
      [sdm, "outsider", "UNREADABLE-SDM-TITLE"],
    ]) {
      const task = await db.task.create({
        data: {
          ...input(scope),
          priority: "HIGH",
          deadline: new Date("2027-01-01"),
          assignedById: "owner",
          assignedToId,
          title: title!,
        },
      });
      if (scope === adcs) taskA = task.id;
      else if (scope === payload) taskP = task.id;
      else taskS = task.id;
    }
    await db.task.update({
      where: { id: taskA },
      data: { dependencyIds: [taskS] },
    });
    for (const [scope, authority, subsystemId] of [
      ["GLOBAL", "OWNER", null],
      ["SUBSYSTEM", "OWNER", adcs],
      ["SUBSYSTEM", "SUBSYSTEM_ADMIN", adcs],
      [null, null, adcs],
    ] as const) {
      const record = await db.decisionRecord.create({
        data: {
          ...decisionInput(),
          scope,
          authority,
          subsystemId,
          authorId: "owner",
          relatedTaskIds: [taskS],
        },
      });
      if (scope === "GLOBAL") globalDecision = record.id;
      else if (!scope) legacyDecision = record.id;
      else if (authority === "OWNER") ownerDecision = record.id;
      else adminDecision = record.id;
    }
    const module = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [
        TasksController,
        SubsystemsController,
        DecisionsController,
        AnalyticsController,
        UsersController,
      ],
      providers: [
        PeopleService,
        TasksService,
        SubsystemsService,
        DecisionsService,
        AnalyticsService,
        UsersService,
        AuditService,
        AuthorizationService,
        CoreAuthorizationService,
        JwtStrategy,
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: SessionService, useValue: sessions },
        { provide: RedisCacheService, useValue: cache },
        { provide: AccountLifecycleService, useValue: {} },
        {
          provide: TaskEventsService,
          useValue: { emitTaskUpdated: jest.fn(), emitCommentAdded: jest.fn() },
        },
      ],
    }).compile();
    // Exercise analytics explicitly; do not start the periodic fixture snapshot worker.
    jest
      .spyOn(module.get(AnalyticsService), "onModuleInit")
      .mockResolvedValue(undefined);
    app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (root && schema)
      await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await root?.$disconnect();
    if (temp) rmSync(temp, { recursive: true, force: true });
  });

  it.each(["owner", "admin", "member", "mixed", "empty"])(
    "%s subsystem catalog follows membership",
    async (actor) => {
      const result = await ids(actor, "/subsystems");
      expect(result.length).toBe(
        actor === "owner"
          ? 5
          : actor === "mixed"
            ? 2
            : actor === "empty"
              ? 0
              : 1,
      );
      if (actor !== "owner" && actor !== "empty")
        expect(result).toContain(adcs);
    },
  );
  it("unreadable health is denied and nested dependency names/IDs are redacted", async () => {
    expect((await req("admin", "/subsystems/sdm/health")).status).toBe(403);
    const health = await req("admin", "/subsystems/adcs/health");
    expect(health.status).toBe(200);
    const text = await health.text();
    expect(text).not.toContain("UNREADABLE");
    expect(text).not.toContain(taskS);
    for (const route of [
      "/tasks",
      "/tasks/dependency-graph",
      "/tasks/activity",
    ]) {
      const res = await req("admin", route);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).not.toContain(taskS);
      expect(body).not.toContain("UNREADABLE");
    }
  });
  it.each(["owner", "admin", "member", "mixed", "empty"])(
    "%s reads only its task scopes",
    async (actor) => {
      const result = await ids(actor, "/tasks");
      if (actor === "owner")
        expect(result).toEqual(expect.arrayContaining([taskA, taskP, taskS]));
      else if (actor === "empty") expect(result).toEqual([]);
      else {
        expect(result).toContain(taskA);
        expect(result).not.toContain(taskS);
        expect(result.includes(taskP)).toBe(actor === "mixed");
      }
    },
  );
  it.each(["admin", "admin2", "multi", "owner"])(
    "%s can create in ADCS",
    async (actor) => {
      expect((await req(actor, "/tasks", "POST", input())).status).toBe(201);
    },
  );
  it.each(["member", "empty", "empty-admin"])(
    "%s cannot create subsystem tasks",
    async (actor) => {
      expect((await req(actor, "/tasks", "POST", input())).status).toBe(403);
    },
  );
  it("mixed ADMIN can manage ADCS but not Payload MEMBER scope", async () => {
    expect(
      (
        await req("mixed", `/tasks/${taskA}/assign`, "PATCH", {
          assignedToId: "member",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req("mixed", `/tasks/${taskP}/assign`, "PATCH", {
          assignedToId: "member",
        })
      ).status,
    ).toBe(403);
    expect((await req("mixed", "/tasks", "POST", input(payload))).status).toBe(
      403,
    );
  });
  it("assigned MEMBER may update status, unassigned MEMBER may not", async () => {
    expect(
      (
        await req("member", `/tasks/${taskA}/status`, "PATCH", {
          status: "IN_PROGRESS",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req("member", `/tasks/${taskP}/status`, "PATCH", {
          status: "IN_PROGRESS",
        })
      ).status,
    ).toBe(403);
    const extra = await user("unassigned", "MEMBER", [
      { subsystemId: adcs, accessLevel: "MEMBER" },
    ]);
    expect(
      (
        await req(extra.id, `/tasks/${taskA}/status`, "PATCH", {
          status: "IN_PROGRESS",
        })
      ).status,
    ).toBe(403);
  });
  it("members cannot administratively mutate or move tasks; spoofed scope never replaces persisted scope", async () => {
    expect((await req("member", `/tasks/${taskA}`, "DELETE")).status).toBe(403);
    expect(
      (
        await req("member", `/tasks/${taskA}/assign`, "PATCH", {
          assignedToId: "member",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req("admin", `/tasks/${taskS}/assign`, "PATCH", {
          assignedToId: "member",
          subsystemId: adcs,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await req("admin", `/tasks/${taskA}/status`, "PATCH", {
          status: "TODO",
          subsystemId: sdm,
        })
      ).status,
    ).toBe(400);
    expect(
      (await req("owner", `/tasks/${taskA}`, "PATCH", { subsystemId: sdm }))
        .status,
    ).toBe(404);
  });
  it("OWNER manages any persisted task scope while unrelated ADMIN deletion fails", async () => {
    expect((await req("admin", `/tasks/${taskS}`, "DELETE")).status).toBe(403);
    expect(
      (
        await req("owner", `/tasks/${taskS}/assign`, "PATCH", {
          assignedToId: "outsider",
        })
      ).status,
    ).toBe(200);
    const task = await db.task.create({
      data: {
        ...input(sdm),
        priority: "HIGH",
        deadline: new Date(),
        assignedById: "owner",
      },
    });
    expect((await req("owner", `/tasks/${task.id}`, "DELETE")).status).toBe(
      200,
    );
  });
  it("mixed ADMIN has ordinary assigned-member collaboration in Payload", async () => {
    expect(
      (
        await req("mixed", `/tasks/${taskP}/status`, "PATCH", {
          status: "IN_PROGRESS",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req("mixed", `/tasks/${taskP}/comments`, "POST", {
          content: "member contribution",
        })
      ).status,
    ).toBe(201);
    expect((await req("mixed", `/tasks/${taskP}`, "DELETE")).status).toBe(403);
  });
  it("comments require read access and preserve authenticated author", async () => {
    expect(
      (
        await req("member", `/tasks/${taskS}/comments`, "POST", {
          content: "denied",
        })
      ).status,
    ).toBe(403);
    const res = await req("member", `/tasks/${taskA}/comments`, "POST", {
      content: "allowed",
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({ authorId: "member" }),
    );
  });
  it.each(["owner", "admin", "member", "empty"])(
    "GLOBAL decisions readable by %s",
    async (actor) => {
      expect((await req(actor, `/decisions/${globalDecision}`)).status).toBe(
        200,
      );
    },
  );
  it.each(["admin", "member", "mixed"])(
    "GLOBAL mutation denied to %s",
    async (actor) => {
      expect(
        (
          await req(actor, `/decisions/${globalDecision}`, "PATCH", {
            title: "denied",
          })
        ).status,
      ).toBe(403);
    },
  );
  it("OWNER controls GLOBAL and subsystem OWNER authority", async () => {
    expect(
      (
        await req("owner", `/decisions/${globalDecision}`, "PATCH", {
          title: "global",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req("owner", `/decisions/${ownerDecision}`, "PATCH", {
          title: "owner",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await req("admin", `/decisions/${ownerDecision}`, "PATCH", {
          title: "denied",
        })
      ).status,
    ).toBe(403);
    expect((await req("member", `/decisions/${ownerDecision}`)).status).toBe(
      200,
    );
    expect((await req("outsider", `/decisions/${ownerDecision}`)).status).toBe(
      403,
    );
  });
  it("only exact subsystem ADMIN can manage delegated decisions", async () => {
    expect(
      (
        await req("admin", `/decisions/${adminDecision}`, "PATCH", {
          title: "allowed",
        })
      ).status,
    ).toBe(200);
    expect((await req("member", `/decisions/${adminDecision}`)).status).toBe(
      200,
    );
    expect(
      (
        await req("member", `/decisions/${adminDecision}`, "PATCH", {
          title: "denied",
        })
      ).status,
    ).toBe(403);
    await user("sdm-admin", "ADMIN", [
      { subsystemId: sdm, accessLevel: "ADMIN" },
    ]);
    expect(
      (await req("sdm-admin", `/decisions/${adminDecision}`, "DELETE")).status,
    ).toBe(403);
  });
  it.each(["owner", "admin", "member"])(
    "legacy metadata fails closed for %s",
    async (actor) => {
      expect((await req(actor, `/decisions/${legacyDecision}`)).status).toBe(
        403,
      );
      expect(
        (
          await req(actor, `/decisions/${legacyDecision}`, "PATCH", {
            title: "denied",
          })
        ).status,
      ).toBe(403);
      const res = await req(actor, "/decisions");
      expect(await res.text()).not.toContain(legacyDecision);
    },
  );
  it("ADMIN creation never infers or accepts OWNER authority", async () => {
    for (const body of [
      decisionInput(),
      { ...decisionInput(adcs), authority: "OWNER" },
      decisionInput(sdm),
    ])
      expect((await req("admin", "/decisions", "POST", body)).status).toBe(403);
    const res = await req("admin", "/decisions", "POST", decisionInput(adcs));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        scope: "SUBSYSTEM",
        authority: "SUBSYSTEM_ADMIN",
        subsystemId: adcs,
      }),
    );
  });
  it("deleting a delegated decision cannot clear an OWNER record's supersession", async () => {
    const target = await db.decisionRecord.create({
      data: {
        ...decisionInput(),
        authorId: "owner",
        scope: "SUBSYSTEM",
        authority: "SUBSYSTEM_ADMIN",
        subsystemId: adcs,
      },
    });
    const referring = await db.decisionRecord.create({
      data: {
        ...decisionInput(),
        authorId: "owner",
        scope: "GLOBAL",
        authority: "OWNER",
        supersededById: target.id,
      },
    });
    expect(
      (await req("admin", `/decisions/${target.id}`, "DELETE")).status,
    ).toBe(403);
    expect(
      (
        await db.decisionRecord.findUniqueOrThrow({
          where: { id: referring.id },
        })
      ).supersededById,
    ).toBe(target.id);
  });
  it("supersession summaries and IDs respect the reader's scope", async () => {
    const hidden = await db.decisionRecord.create({
      data: {
        ...decisionInput(),
        title: "PRIVATE-SDM-DECISION",
        authorId: "owner",
        scope: "SUBSYSTEM",
        authority: "OWNER",
        subsystemId: sdm,
      },
    });
    await db.decisionRecord.update({
      where: { id: globalDecision },
      data: { supersededById: hidden.id },
    });
    const body = await (
      await req("member", `/decisions/${globalDecision}`)
    ).text();
    expect(body).not.toContain(hidden.id);
    expect(body).not.toContain("PRIVATE-SDM-DECISION");
    expect(
      await (await req("owner", `/decisions/${globalDecision}`)).text(),
    ).toContain("PRIVATE-SDM-DECISION");
  });
  it("decision links cannot leak hidden related task IDs", async () => {
    const res = await req("member", `/decisions/${globalDecision}`);
    expect(await res.text()).not.toContain(taskS);
  });
  it.each(["owner", "admin", "multi", "mixed", "member", "empty-admin"])(
    "%s analytics resolves authorized scope",
    async (actor) => {
      const service = app.get(AnalyticsService);
      const scope = await service.resolveScope(actor);
      expect(scope).toEqual(
        actor === "owner"
          ? { kind: "GLOBAL" }
          : actor === "member"
            ? { kind: "PERSONAL", id: actor }
            : actor === "empty-admin"
              ? { kind: "EMPTY", id: actor }
              : {
                  kind: "ADMIN",
                  ids: (actor === "multi" ? [adcs, payload] : [adcs]).sort(),
                },
      );
      const res = await req(actor, "/analytics/bundle");
      expect(res.status).toBe(200);
      const json: { subsystems: { name: string }[] } = await res.json();
      if (actor === "admin" || actor === "mixed")
        expect(json.subsystems.map((s) => s.name)).toEqual(["ADCS"]);
    },
  );
  it("OWNER selected subsystem and ADMIN selection enforce scope; MEMBER cannot select admin analytics", async () => {
    expect(
      await app.get(AnalyticsService).resolveScope("owner", payload),
    ).toEqual({ kind: "SUBSYSTEM", id: payload });
    expect(
      (await req("owner", `/analytics/bundle?subsystemId=${payload}`)).status,
    ).toBe(200);
    expect(
      (await req("mixed", `/analytics/bundle?subsystemId=${payload}`)).status,
    ).toBe(403);
    expect(
      (await req("member", `/analytics/bundle?subsystemId=${adcs}`)).status,
    ).toBe(403);
  });
  it("cache identities distinguish owner, admin set and personal; sets normalize", () => {
    expect(
      new Set([
        scopeKey({ kind: "GLOBAL" }),
        scopeKey({ kind: "SUBSYSTEM", id: adcs }),
        scopeKey({ kind: "ADMIN", ids: [adcs] }),
        scopeKey({ kind: "PERSONAL", id: "member" }),
      ]).size,
    ).toBe(4);
    expect(scopeKey({ kind: "ADMIN", ids: [adcs, payload] })).toBe(
      scopeKey({ kind: "ADMIN", ids: [payload, adcs, adcs] }),
    );
  });
  it("revocation affects next request, including populated analytics cache and stale role claims", async () => {
    await user("revoked", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    expect((await req("revoked", "/analytics/bundle")).status).toBe(200);
    await app
      .get(AuthorizationService)
      .withMembershipRoleSync("revoked", (tx) =>
        tx.subsystemMembership.delete({
          where: {
            userId_subsystemId: { userId: "revoked", subsystemId: adcs },
          },
        }),
      );
    expect(await ids("revoked", "/tasks")).toEqual([]);
    expect((await req("revoked", "/tasks", "POST", input())).status).toBe(403);
    expect(await app.get(AnalyticsService).resolveScope("revoked")).toEqual({
      kind: "PERSONAL",
      id: "revoked",
    });
    const body: { scope: string } = await (
      await req("revoked", "/analytics/bundle")
    ).json();
    expect(body.scope).toBe("PERSONAL");
    expect(
      (await req("revoked", `/analytics/bundle?subsystemId=${adcs}`)).status,
    ).toBe(403);
  });
  it("directory scopes and profiles do not grant unrelated management or leak secrets", async () => {
    expect(await ids("owner", "/users/members")).toContain("outsider");
    expect(await ids("admin", "/users/members")).not.toContain("outsider");
    expect(await ids("empty-admin", "/users/members")).toEqual([]);
    const members = await req("member", "/users/members");
    const text = await members.text();
    expect(text).not.toContain("outsider");
    expect(text).not.toContain("email");
    expect(text).not.toContain("passwordHash");
    expect(text).not.toContain("refreshTokenHash");
    expect(
      (
        await req("admin", "/users/outsider/profile", "PATCH", {
          skills: ["spoof"],
        })
      ).status,
    ).toBe(403);
  });
  it("inconsistent MEMBER with ADMIN membership fails closed", async () => {
    await user("inconsistent", "MEMBER", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    expect(await ids("inconsistent", "/tasks")).toEqual([]);
    expect(await ids("inconsistent", "/subsystems")).toEqual([]);
    expect(
      await app.get(AnalyticsService).resolveScope("inconsistent"),
    ).toEqual({ kind: "EMPTY", id: "inconsistent" });
  });

  async function waitForBlockedQuery() {
    for (let i = 0; i < 100; i++) {
      const rows = await root.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
      if (Number(rows[0]?.count) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected database lock waiter");
  }
  it("task mutation waits for scope lock and rejects newly unauthorized persisted scope", async () => {
    const task = await db.task.create({
      data: {
        ...input(),
        priority: "HIGH",
        deadline: new Date(),
        assignedById: "owner",
      },
    });
    let release!: () => void;
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const moving = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Task" WHERE id = ${task.id} FOR UPDATE`;
        await tx.task.update({
          where: { id: task.id },
          data: { subsystemId: sdm },
        });
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const mutation = req("admin", `/tasks/${task.id}/assign`, "PATCH", {
      assignedToId: "member",
    });
    try {
      await waitForBlockedQuery();
    } finally {
      release();
    }
    await moving;
    expect((await mutation).status).toBe(403);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } }))
        .assignedToId,
    ).toBeNull();
  });
  it("decision mutation waits for placement lock and rechecks new authority", async () => {
    const record = await db.decisionRecord.create({
      data: {
        ...decisionInput(),
        authorId: "owner",
        scope: "SUBSYSTEM",
        authority: "SUBSYSTEM_ADMIN",
        subsystemId: adcs,
      },
    });
    let release!: () => void;
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const moving = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "DecisionRecord" WHERE id = ${record.id} FOR UPDATE`;
        await tx.decisionRecord.update({
          where: { id: record.id },
          data: { authority: "OWNER" },
        });
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const mutation = req("admin", `/decisions/${record.id}`, "PATCH", {
      title: "must-not-write",
    });
    try {
      await waitForBlockedQuery();
    } finally {
      release();
    }
    await moving;
    expect((await mutation).status).toBe(403);
    expect(
      (await db.decisionRecord.findUniqueOrThrow({ where: { id: record.id } }))
        .title,
    ).toBe("decision");
  });
  it("membership removal and task mutation serialize on the actor account", async () => {
    await user("racing-admin", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    let release!: () => void;
    let acquired!: () => void;
    const locked = new Promise<void>((resolve) => {
      acquired = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const removing = db.$transaction(
      async (tx) => {
        await lockAccounts(tx, ["racing-admin"]);
        await app.get(AuthorizationService).withMembershipRoleSync(
          "racing-admin",
          (inner) =>
            inner.subsystemMembership.delete({
              where: {
                userId_subsystemId: {
                  userId: "racing-admin",
                  subsystemId: adcs,
                },
              },
            }),
          tx,
        );
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    // Direct service call models a request whose JWT guard completed before revocation.
    const pending = app
      .get(TasksService)
      .reassign(taskA, "outsider", "racing-admin")
      .then(
        () => "allowed",
        () => "denied",
      );
    try {
      await waitForBlockedQuery();
    } finally {
      release();
    }
    await removing;
    expect(await pending).toBe("denied");
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: taskA } })).assignedToId,
    ).toBe("member");
  });
  it("failed transactional audit rolls task creation back", async () => {
    const before = await db.task.count();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION "${schema}".reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_audit()',
    );
    try {
      expect((await req("admin", "/tasks", "POST", input())).status).toBe(500);
      expect(await db.task.count()).toBe(before);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER fail_audit ON "AuditLog"');
    }
  });
});
