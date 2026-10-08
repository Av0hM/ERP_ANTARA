import { storageFixture } from "../../../test/storage.fixture";
import { StorageRouter } from "../storage/storage.router";
import { StorageConfig } from "../storage/storage.config";
import { Queue } from "bullmq";
import { getQueueToken } from "@nestjs/bullmq";
import { GoogleIntegrationService } from "../integrations/google.integration.service";
import { ResourcesController } from "../../modules/resources/resources.controller";
import { ResourcesService } from "../../modules/resources/resources.service";
import { FilesController } from "../../modules/files/files.controller";
import { FilesService } from "../../modules/files/files.service";
import { CalendarController } from "../../modules/calendar/calendar.controller";
import { CalendarService } from "../../modules/calendar/calendar.service";
import { MeetingsController } from "../../modules/meetings/meetings.controller";
import { MeetingAutomationService } from "../../modules/meetings/meetings.service";
import { ReportsController } from "../../modules/reports/reports.controller";
import { ReportsService } from "../../modules/reports/reports.service";
import { NotificationsController } from "../../modules/notifications/notifications.controller";
import { NotificationsService } from "../../modules/notifications/notifications.service";
import { WorklogsController } from "../../modules/worklogs/worklogs.controller";
import { WorklogsService } from "../../modules/worklogs/worklogs.service";
import { AiController } from "../../modules/ai/ai.controller";
import { AiService } from "../../modules/ai/ai.service";
import { AuditController } from "../../modules/audit/audit.controller";
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

const testUrl = process.env.REMAINING_TEST_DATABASE_URL;
if (process.env.REMAINING_REQUIRE_DB === "true" && !testUrl)
  throw new Error("REMAINING_TEST_DATABASE_URL required");
const integration = testUrl ? describe : describe.skip;

integration("Phase 4B current DB scoped HTTP and object races", () => {
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
    auth: { accessSecret: "phase4b-fixture-secret" },
  });
  const google = {
    isDriveConfigured: jest.fn(() => true),
    uploadDriveFile: jest.fn(async () => ({ id: "provider-file" })),
    deleteDriveFile: jest.fn(),
    isCalendarConfigured: jest.fn(() => false),
    createCalendarEvent: jest.fn(),
    deleteCalendarEvent: jest.fn(),
  };
  const jwt = new JwtService();
  let sessions: SessionService;
  let notifications: NotificationsService;
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
    if (url.pathname !== "/antara_phase4b_test")
      throw new Error("Use dedicated antara_phase4b_test database");
    schema = `phase4b_${process.pid}_${Date.now()}`;
    root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    temp = mkdtempSync(path.join(tmpdir(), "antara-phase4b-"));
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
        ResourcesController,
        FilesController,
        CalendarController,
        MeetingsController,
        ReportsController,
        NotificationsController,
        WorklogsController,
        AiController,
        AuditController,
      ],
      providers: [
        TasksService,
        ResourcesService,
        FilesService,
        CalendarService,
        MeetingAutomationService,
        ReportsService,
        {
          provide: NotificationsService,
          useFactory: (queue: Queue, core: CoreAuthorizationService) =>
            new NotificationsService(db, config, queue, core),
          inject: [
            getQueueToken("notification-email"),
            CoreAuthorizationService,
          ],
        },
        WorklogsService,
        AiService,
        { provide: GoogleIntegrationService, useValue: google },
        {
          provide: StorageRouter,
          useFactory: () => storageFixture(google).router,
        },
        { provide: StorageConfig, useFactory: () => storageFixture().config },

        {
          provide: getQueueToken("notification-email"),
          useValue: { add: jest.fn() },
        },

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
    notifications = module.get(NotificationsService);
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

  const attachment = (taskId: string) => ({
    name: "file",
    mimeType: "text/plain",
    sizeBytes: 1,
    contentBase64: "YQ==",
    taskId,
  });
  const event = (subsystemId?: string) => ({
    title: "event",
    startsAt: "2027-01-01T10:00:00Z",
    endsAt: "2027-01-01T11:00:00Z",
    ...(subsystemId ? { subsystemId } : {}),
  });
  async function safe(res: Response) {
    expect(res.status).toBeLessThan(300);
    const text = await res.text();
    for (const key of [
      "passwordHash",
      "refreshTokenHash",
      "secret-fixture-only",
      "isDummySeed",
    ])
      expect(text).not.toContain(key);
    return JSON.parse(text) as unknown;
  }
  it.each(["owner", "admin"])(
    "%s may assign same-subsystem/cross-functional member",
    async (actor) => {
      for (const assignedToId of ["member", "mixed"])
        expect(
          (
            await req(actor, `/tasks/${taskA}/assign`, "PATCH", {
              assignedToId,
            })
          ).status,
        ).toBe(200);
    },
  );
  it.each(["owner", "admin"])(
    "%s cannot assign unrelated users through either entry point or create",
    async (actor) => {
      expect(
        (
          await req(actor, `/tasks/${taskA}/assign`, "PATCH", {
            assignedToId: "outsider",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await req(actor, `/resources/tasks/${taskA}/assign`, "PATCH", {
            assigneeId: "outsider",
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await req(actor, "/tasks", "POST", {
            ...input(),
            assignedToId: "outsider",
          })
        ).status,
      ).toBe(403);
    },
  );
  it.each(["inactive", "deleted"])(
    "rejects %s assignment target",
    async (state) => {
      await user(state, "MEMBER", [
        { subsystemId: adcs, accessLevel: "MEMBER" },
      ]);
      await db.user.update({
        where: { id: state },
        data:
          state === "inactive"
            ? { isActive: false }
            : { deletedAt: new Date() },
      });
      expect(
        (
          await req("owner", `/tasks/${taskA}/assign`, "PATCH", {
            assignedToId: state,
          })
        ).status,
      ).toBe(403);
    },
  );
  it("legacy invalid assignment survives reads but cannot be recreated", async () => {
    await db.task.update({
      where: { id: taskA },
      data: { assignedToId: "outsider" },
    });
    expect(await ids("member", "/tasks")).toContain(taskA);
    expect(
      (
        await req("owner", `/tasks/${taskA}/assign`, "PATCH", {
          assignedToId: "outsider",
        })
      ).status,
    ).toBe(403);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: taskA } })).assignedToId,
    ).toBe("outsider");
    await db.task.update({
      where: { id: taskA },
      data: { assignedToId: "member" },
    });
  });
  it.each(["member", "admin"])(
    "%s edits own global profile safely",
    async (actor) => {
      await safe(
        await req(actor, `/users/${actor}/profile`, "PATCH", {
          skills: ["own"],
        }),
      );
    },
  );
  it.each(["admin", "mixed", "multi"])(
    "%s cannot edit another user's shared profile",
    async (actor) => {
      expect(
        (
          await req(actor, "/users/member/profile", "PATCH", {
            weeklyCapacityHours: 99,
          })
        ).status,
      ).toBe(403);
    },
  );
  it("OWNER edits global profile", async () => {
    await safe(
      await req("owner", "/users/member/profile", "PATCH", {
        skills: ["approved"],
      }),
    );
  });
  it.each(["owner", "admin", "mixed", "member", "empty-admin"])(
    "%s resource view is bounded",
    async (actor) => {
      const res = await req(actor, "/resources/allocation-board");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("passwordHash");
      if (actor !== "owner") {
        expect(text).not.toContain("UNREADABLE-SDM-TITLE");
        expect(text).not.toContain("payload-private");
      }
      if (actor === "member" || actor === "empty-admin")
        expect(JSON.parse(text)).toEqual({
          users: [],
          weeks: [],
          conflicts: [],
          aiSuggestions: [],
        });
    },
  );
  it("Resources delegates successful assignment and transactional audit", async () => {
    await safe(
      await req("admin", `/resources/tasks/${taskA}/assign`, "PATCH", {
        assigneeId: "member",
      }),
    );
    expect(
      await db.auditLog.count({
        where: { entityId: taskA, action: "REASSIGN" },
      }),
    ).toBeGreaterThan(0);
  });
  it.each(["member", "admin"])(
    "%s cannot use alternate resource assignment to escape scope",
    async (actor) => {
      expect(
        (
          await req(actor, `/resources/tasks/${taskP}/assign`, "PATCH", {
            assigneeId: "mixed",
            subsystemId: adcs,
          })
        ).status,
      ).toBe(403);
    },
  );
  let fileA: string;
  let fileP: string;
  it("OWNER uploads both scopes; file list follows readable task", async () => {
    const a: { id: string } = await (
      await req("owner", "/files/attachments", "POST", attachment(taskA))
    ).json();
    fileA = a.id;
    const p: { id: string } = await (
      await req("owner", "/files/attachments", "POST", attachment(taskP))
    ).json();
    fileP = p.id;
    expect(await ids("member", "/files/attachments")).toEqual([fileA]);
    expect(await ids("mixed", "/files/attachments")).toEqual(
      expect.arrayContaining([fileA, fileP]),
    );
  });
  it.each(["member", "admin", "mixed"])(
    "%s cannot delete Payload file",
    async (actor) => {
      expect(
        (await req(actor, `/files/attachments/${fileP}`, "DELETE")).status,
      ).toBe(403);
    },
  );
  it("OWNER retains attachment management for historical archived tasks", async () => {
    const task = await db.task.create({
      data: {
        ...input(),
        priority: "HIGH",
        deadline: new Date(),
        assignedById: "owner",
        isArchived: true,
      },
    });
    const file = await db.attachment.create({
      data: {
        taskId: task.id,
        name: "historical",
        mimeType: "text/plain",
        sizeBytes: 1,
        storageUrl: "https://fixture.invalid/file",
        tags: [],
      },
    });
    expect(
      (await req("owner", `/files/attachments/${file.id}`, "DELETE")).status,
    ).toBe(200);
  });
  it("ADMIN upload cannot bypass persisted task scope", async () => {
    const before = await db.attachment.count();
    expect(
      (await req("admin", "/files/attachments", "POST", attachment(taskP)))
        .status,
    ).toBe(403);
    expect(await db.attachment.count()).toBe(before);
    await safe(
      await req("admin", "/files/attachments", "POST", attachment(taskA)),
    );
  });
  it("ADMIN deletes managed file with audit", async () => {
    expect(
      (await req("admin", `/files/attachments/${fileA}`, "DELETE")).status,
    ).toBe(200);
    expect(
      await db.auditLog.count({
        where: { entityId: fileA, action: "FILE_SOFT_DELETE" },
      }),
    ).toBe(1);
  });
  it("MEMBER upload remains prohibited by existing collaboration contract", async () => {
    expect(
      (await req("member", "/files/attachments", "POST", attachment(taskA)))
        .status,
    ).toBe(403);
  });
  it("OWNER creates scoped and unscoped events; MEMBER sees only membership scope", async () => {
    await safe(await req("owner", "/calendar/events", "POST", event()));
    await safe(await req("owner", "/calendar/events", "POST", event(payload)));
    await safe(await req("admin", "/calendar/events", "POST", event(adcs)));
    const rows: { subsystemId: string }[] = await (
      await req("member", "/calendar/events")
    ).json();
    expect(rows.length).toBe(1);
    expect(rows.every((row) => row.subsystemId === adcs)).toBe(true);
    expect((await ids("owner", "/calendar/events")).length).toBe(3);
  });
  it.each(["member", "admin", "mixed"])(
    "%s cannot create unrelated/global event",
    async (actor) => {
      for (const sub of [payload, undefined])
        expect(
          (await req(actor, "/calendar/events", "POST", event(sub))).status,
        ).toBe(403);
    },
  );
  it.each(["member", "admin"])(
    "%s reads matching meeting agenda only",
    async (actor) => {
      await safe(await req(actor, `/meetings/agenda/${adcs}`));
      expect((await req(actor, `/meetings/agenda/${payload}`)).status).toBe(
        403,
      );
    },
  );
  it("meeting sync requires managed scope; unreviewed schedule is explicit; no task bypass", async () => {
    const res = await req("admin", `/meetings/sync/create/${adcs}`, "POST");
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      created: 0,
      unavailable: "REVIEWED_SYNC_SCHEDULE_REQUIRED",
    });
    expect(
      (await req("admin", `/meetings/sync/create/${payload}`, "POST")).status,
    ).toBe(403);
    expect(
      (await req("member", `/meetings/sync/create/${adcs}`, "POST")).status,
    ).toBe(403);
    const before = await db.task.count();
    expect(
      (
        await req("admin", "/meetings/action-items", "POST", {
          items: [{ taskId: taskP, assigneeId: "outsider" }],
        })
      ).status,
    ).toBe(501);
    expect(await db.task.count()).toBe(before);
  });
  it.each([
    "/reports/handoff",
    "/reports/handoff/markdown",
    "/reports/handoff/download",
  ])(
    "report %s never exports unrelated scopes or global history",
    async (route) => {
      const owner = await req("owner", route);
      expect(owner.status).toBe(200);
      expect(await owner.text()).toContain("SDM");
      const admin = await req("mixed", route);
      expect(admin.status).toBe(200);
      const text = await admin.text();
      expect(text).not.toContain("SDM");
      expect(text).not.toContain("payload-private");
      expect(text).not.toContain("passwordHash");
      expect((await req("member", route)).status).toBe(403);
      expect(
        (await req("admin", `${route}?subsystemId=${payload}`)).status,
      ).toBe(403);
    },
  );
  it("selected OWNER report narrows all output; empty ADMIN returns no records", async () => {
    const selected = await req("owner", `/reports/handoff?subsystemId=${adcs}`);
    expect(await selected.text()).not.toContain("SDM");
    const empty: { subsystemStatus: unknown[]; keyContacts: unknown[] } =
      await (await req("empty-admin", "/reports/handoff")).json();
    expect(empty.subsystemStatus).toEqual([]);
    expect(empty.keyContacts).toEqual([]);
  });
  let note: string;
  it("notifications are personal and content cannot replay revoked object titles", async () => {
    note = (
      await db.notification.create({
        data: {
          userId: "member",
          title: "UNREADABLE-SDM-TITLE",
          body: "secret details",
          type: "TASK_ASSIGNED",
          taskId: taskS,
        },
      })
    ).id;
    expect(await ids("admin", "/notifications")).not.toContain(note);
    const res = await req("member", "/notifications");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("UNREADABLE");
    expect(text).not.toContain(taskS);
    await notifications.createAndNotify(
      "member",
      "secret title",
      "secret body",
      "TASK_ASSIGNED",
      taskS,
    );
    expect(
      await db.notification.count({ where: { title: "secret title" } }),
    ).toBe(0);
  });
  it.each(["PATCH", "DELETE"])(
    "notification %s checks recipient even for OWNER",
    async (method) => {
      expect(
        (
          await req(
            "owner",
            `/notifications/${note}`,
            method,
            method === "PATCH" ? { isRead: true } : undefined,
          )
        ).status,
      ).toBe(404);
      expect(
        (
          await req(
            "member",
            `/notifications/${note}`,
            method,
            method === "PATCH" ? { isRead: true } : undefined,
          )
        ).status,
      ).toBe(200);
    },
  );
  it("worklog reads/summary are personal except OWNER", async () => {
    for (const [userId, taskId, durationMin] of [
      ["member", taskA, 71],
      ["admin", taskA, 17],
      ["outsider", taskS, 900],
    ] as const)
      await db.workLog.create({
        data: { userId, taskId, durationMin, startedAt: new Date() },
      });
    for (const actor of ["member", "admin"]) {
      const rows: { userId: string }[] = await (
        await req(actor, "/worklogs?userId=outsider")
      ).json();
      expect(rows.every((row) => row.userId === actor)).toBe(true);
      const summary: { totalMinutes: number } = await (
        await req(actor, "/worklogs/summary?userId=outsider")
      ).json();
      expect(summary.totalMinutes).toBe(actor === "member" ? 71 : 17);
    }
    expect((await ids("owner", "/worklogs")).length).toBe(3);
  });
  it("worklog mutations require visible task and own session", async () => {
    expect(
      (await req("member", "/worklogs/start", "POST", { taskId: taskS }))
        .status,
    ).toBe(403);
    const log = await db.workLog.findFirstOrThrow({
      where: { userId: "outsider" },
    });
    expect(
      (
        await req("member", `/worklogs/${log.id}/stop`, "PATCH", {
          endedAt: new Date().toISOString(),
          durationMin: 2,
        })
      ).status,
    ).toBe(404);
  });
  it("ADMIN analytics never aggregates member timing and old caches are not reused", async () => {
    const res = await req("admin", "/analytics/heatmap");
    expect(res.status).toBe(200);
    const heatmap: { intensity: number }[] = await res.json();
    expect(heatmap.every((cell) => cell.intensity === 0)).toBe(true);
    expect([...values.keys()].some((key) => key.includes("v4b:ADMIN"))).toBe(
      true,
    );
  });
  it("subsystem health does not expose member timing or administrative workload to MEMBER", async () => {
    const log = await db.workLog.create({
      data: {
        taskId: taskA,
        userId: "member",
        durationMin: 777,
        startedAt: new Date(),
        notes: "private-timing-marker",
      },
    });
    for (const actor of ["admin", "member"]) {
      const res = await req(actor, "/subsystems/adcs/health");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain(log.id);
      expect(text).not.toContain("private-timing-marker");
      if (actor === "member")
        expect(JSON.parse(text)).toMatchObject({ workload: [] });
    }
  });
  it("legacy global snapshots and AI prose cannot enter scoped analytics/reports", async () => {
    await db.aIInsight.create({
      data: {
        title: "GLOBAL-SECRET-INSIGHT",
        summary: "unscoped provenance",
        recommendation: "secret",
        severity: "WARNING",
        riskScore: 50,
        subsystemId: adcs,
      },
    });
    await db.analyticsSnapshot.create({
      data: {
        scope: "GLOBAL",
        periodStart: new Date(),
        periodEnd: new Date(),
        tasksCompleted: 99,
        avgCompletionHours: 999,
        overduePercentage: 10,
        velocityScore: 99,
        payload: { secret: "GLOBAL-SECRET-SNAPSHOT" },
      },
    });
    for (const route of [
      "/reports/handoff",
      "/reports/handoff/download",
      "/analytics/bundle",
      "/ai/bundle",
    ]) {
      const res = await req("admin", route);
      expect(res.status).toBe(200);
      expect(await res.text()).not.toContain("GLOBAL-SECRET");
    }
  });
  it.each([
    "/ai/insights",
    "/ai/bundle",
    "/ai/reminders",
    "/ai/schedule",
    "/ai/workload",
    "/ai/schedule-risk",
  ])(
    "AI %s filters scope and denies member administrative detail",
    async (route) => {
      const res = await req("admin", route);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).not.toContain("UNREADABLE-SDM-TITLE");
      expect(text).not.toContain("payload-private");
      expect(text).not.toContain("900");
      const member = await req("member", route);
      expect(member.status).toBe(route.endsWith("schedule-risk") ? 403 : 200);
    },
  );
  it("audit history is OWNER only", async () => {
    await safe(await req("owner", "/audit"));
    for (const actor of ["admin", "member"])
      expect((await req(actor, "/audit")).status).toBe(403);
  });
  it("empty administrative scopes never invoke AI or reuse legacy results", async () => {
    for (const route of ["/ai/insights", "/ai/workload", "/ai/schedule"])
      expect(await (await req("empty-admin", route)).json()).toEqual([]);
    expect(
      await (await req("empty-admin", "/ai/schedule-risk")).json(),
    ).toMatchObject({ taskRisks: [], summary: { totalTasks: 0 } });
  });
  it("membership revocation invalidates next protected request and scoped cache", async () => {
    await req("admin2", "/resources/allocation-board");
    await req("admin2", "/ai/bundle");
    await new AuthorizationService(db).withMembershipRoleSync("admin2", (tx) =>
      tx.subsystemMembership.delete({
        where: { userId_subsystemId: { userId: "admin2", subsystemId: adcs } },
      }),
    );
    expect(
      (
        await req("admin2", `/resources/tasks/${taskA}/assign`, "PATCH", {
          assigneeId: "member",
        })
      ).status,
    ).toBe(403);
    expect(await (await req("admin2", "/ai/insights")).json()).toEqual([]);
  });
  async function waitForBlockedQuery() {
    for (let i = 0; i < 200; i++) {
      const rows = await root.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;
      if (Number(rows[0]?.count) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected database lock waiter");
  }
  it.each(["tasks", "resources/tasks"])(
    "%s assignment serializes target membership removal",
    async (route) => {
      const target = `race-${route.replaceAll("/", "-")}`;
      await user(target, "MEMBER", [
        { subsystemId: adcs, accessLevel: "MEMBER" },
      ]);
      let acquired!: () => void;
      let release!: () => void;
      const locked = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const removal = new AuthorizationService(db).withMembershipRoleSync(
        target,
        async (tx) => {
          await tx.subsystemMembership.delete({
            where: {
              userId_subsystemId: { userId: target, subsystemId: adcs },
            },
          });
          acquired();
          await gate;
        },
      );
      await locked;
      const mutation = req(
        "owner",
        `/${route}/${taskA}/assign`,
        "PATCH",
        route === "tasks" ? { assignedToId: target } : { assigneeId: target },
      );
      try {
        await waitForBlockedQuery();
      } finally {
        release();
      }
      await removal;
      expect((await mutation).status).toBe(403);
      expect(
        (await db.task.findUniqueOrThrow({ where: { id: taskA } }))
          .assignedToId,
      ).not.toBe(target);
    },
  );
  it("Resources locks persisted task scope before assignment", async () => {
    const task = await db.task.create({
      data: {
        ...input(),
        priority: "HIGH",
        deadline: new Date(),
        assignedById: "owner",
      },
    });
    let acquired!: () => void;
    let release!: () => void;
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
          data: { subsystemId: payload },
        });
        acquired();
        await gate;
      },
      { timeout: 10000 },
    );
    await locked;
    const mutation = req(
      "admin",
      `/resources/tasks/${task.id}/assign`,
      "PATCH",
      { assigneeId: "mixed", subsystemId: adcs },
    );
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
  it("file upload reauthorizes after provider latency and compensates scope change", async () => {
    const task = await db.task.create({
      data: {
        ...input(),
        priority: "HIGH",
        deadline: new Date(),
        assignedById: "owner",
      },
    });
    google.uploadDriveFile.mockImplementationOnce(async () => {
      await db.task.update({
        where: { id: task.id },
        data: { subsystemId: payload },
      });
      return { id: "must-clean" };
    });
    expect(
      (await req("admin", "/files/attachments", "POST", attachment(task.id)))
        .status,
    ).toBe(403);
    expect(await db.attachment.count({ where: { taskId: task.id } })).toBe(0);
    expect(google.deleteDriveFile).toHaveBeenCalledWith("must-clean");
  });
  it("calendar reauthorizes after provider latency and compensates revocation", async () => {
    await user("calendar-admin", "ADMIN", [
      { subsystemId: adcs, accessLevel: "ADMIN" },
    ]);
    google.isCalendarConfigured.mockReturnValue(true);
    google.createCalendarEvent.mockImplementationOnce(async () => {
      await new AuthorizationService(db).withMembershipRoleSync(
        "calendar-admin",
        (tx) =>
          tx.subsystemMembership.delete({
            where: {
              userId_subsystemId: {
                userId: "calendar-admin",
                subsystemId: adcs,
              },
            },
          }),
      );
      return { id: "calendar-clean" };
    });
    try {
      expect(
        (await req("calendar-admin", "/calendar/events", "POST", event(adcs)))
          .status,
      ).toBe(403);
      expect(google.deleteCalendarEvent).toHaveBeenCalledWith("calendar-clean");
      expect(
        await db.calendarEvent.count({
          where: { externalRef: "calendar-clean" },
        }),
      ).toBe(0);
    } finally {
      google.isCalendarConfigured.mockReturnValue(false);
    }
  });
  it("newly protected routes reject revoked sessions", async () => {
    await user("revoked", "MEMBER", [
      { subsystemId: adcs, accessLevel: "MEMBER" },
    ]);
    await sessions.revokeAllSessions("revoked");
    for (const route of [
      "/files/attachments",
      "/calendar/events",
      "/notifications",
      "/worklogs",
      "/ai/bundle",
      "/resources/allocation-board",
    ])
      expect((await req("revoked", route)).status).toBe(401);
  });
});
