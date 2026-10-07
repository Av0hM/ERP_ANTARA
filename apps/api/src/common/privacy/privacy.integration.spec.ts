import { AuthorizationService } from "../authorization/authorization.service";
import { CoreAuthorizationService } from "../authorization/core-authorization.service";
import { ResourcesService } from "../../modules/resources/resources.service";
import { ResourcesController } from "../../modules/resources/resources.controller";
import { UsersController } from "../../modules/users/users.controller";
import { AccountLifecycleService } from "../../modules/users/account-lifecycle.service";
import { AiService } from "../../modules/ai/ai.service";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionService, lockAccounts } from "../sessions/session.service";
import { GoogleIntegrationService } from "../integrations/google.integration.service";
import { requireLocalDatabaseUrl } from "../../scripts/local-database-url";
import { JwtStrategy } from "../../modules/auth/strategies/jwt.strategy";
import { TasksController } from "../../modules/tasks/tasks.controller";
import { TasksService } from "../../modules/tasks/tasks.service";
import { TaskEventsService } from "../../modules/tasks/events/task-events.service";
import { WorklogsController } from "../../modules/worklogs/worklogs.controller";
import { WorklogsService } from "../../modules/worklogs/worklogs.service";
import { FilesController } from "../../modules/files/files.controller";
import { FilesService } from "../../modules/files/files.service";
import { CalendarController } from "../../modules/calendar/calendar.controller";
import { CalendarService } from "../../modules/calendar/calendar.service";
import { DecisionsController } from "../../modules/decisions/decisions.controller";
import { DecisionsService } from "../../modules/decisions/decisions.service";
import { UsersService } from "../../modules/users/users.service";
import { AuditService } from "../../modules/audit/audit.service";
import { NotificationsService } from "../../modules/notifications/notifications.service";
import { NotificationsController } from "../../modules/notifications/notifications.controller";
import { Queue } from "bullmq";
import { MetricsModule } from "../../modules/metrics/metrics.module";

const testUrl = process.env.PRIVACY_TEST_DATABASE_URL;
if (process.env.PRIVACY_REQUIRE_DB === "true" && !testUrl)
  throw new Error("PRIVACY_TEST_DATABASE_URL required");
const integration = testUrl ? describe : describe.skip;

function expectSafe(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(expectSafe);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(
      [
        "passwordHash",
        "refreshTokenHash",
        "refreshToken",
        "sessions",
        "isDummySeed",
        "deletedAt",
      ].includes(key),
    ).toBe(false);
    expectSafe(child);
  }
}
// Feature records may have their own deletedAt; this helper checks their user relations.
function expectSafeUsers(value: unknown) {
  if (Array.isArray(value)) {
    value.forEach(expectSafeUsers);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    expect(
      [
        "passwordHash",
        "refreshTokenHash",
        "refreshToken",
        "sessions",
        "isDummySeed",
      ].includes(key),
    ).toBe(false);
    if (
      [
        "assignedTo",
        "assignedBy",
        "user",
        "author",
        "uploadedBy",
        "actor",
      ].includes(key)
    )
      expectSafe(child);
    else expectSafeUsers(child);
  }
}

integration("Phase 3 real PostgreSQL and authenticated HTTP", () => {
  let db: PrismaService;
  let root: PrismaClient;
  let app: INestApplication;
  let origin: string;
  let temp: string;
  let schema: string;
  let ownerToken: string;
  let memberToken: string;
  let taskId: string;
  const google = {
    isCalendarConfigured: jest.fn(() => false),
    isDriveConfigured: jest.fn(() => true),
    uploadDriveFile: jest.fn(async () => ({
      id: "stored-drive-file",
      webViewLink: "https://drive.google.com/file/d/stored-drive-file/view",
    })),
    deleteDriveFile: jest.fn(async () => undefined),
    createCalendarEvent: jest.fn(async () => ({ id: "stored-event" })),
    deleteCalendarEvent: jest.fn(async () => undefined),
  };
  const events = { emitTaskUpdated: jest.fn(), emitCommentAdded: jest.fn() };
  const config = new ConfigService({
    auth: { accessSecret: "isolated-phase3-secret" },
  });
  const taskInput = {
    title: "Fixture task",
    description: "Fixture",
    priority: "HIGH",
    subsystemId: "adcs",
    assignedToId: "member",
    estimatedHours: 2,
    deadline: "2027-01-01T00:00:00Z",
  };
  const calendarInput = {
    title: "Fixture event",
    startsAt: "2027-01-01T00:00:00Z",
    endsAt: "2027-01-01T01:00:00Z",
    subsystemId: "adcs",
  };
  const fileInput = {
    name: "fixture.txt",
    mimeType: "text/plain",
    sizeBytes: 5,
    contentBase64: Buffer.from("hello").toString("base64"),
  };
  const worklogInput = () => ({
    taskId,
    startedAt: "2026-10-01T00:00:00Z",
    endedAt: "2026-10-01T01:00:00Z",
    durationMin: 60,
  });
  async function request(
    route: string,
    method = "GET",
    body?: unknown,
    token = ownerToken,
  ) {
    const res = await fetch(`${origin}/api${route}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return res;
  }
  beforeAll(async () => {
    const url = new URL(requireLocalDatabaseUrl(testUrl));
    if (url.pathname !== "/antara_phase3_test")
      throw new Error("Use dedicated antara_phase3_test database");
    schema = `phase3_${process.pid}_${Date.now()}`;
    root = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await root.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    temp = mkdtempSync(path.join(tmpdir(), "antara-phase3-"));
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
    const sessions = new SessionService(db, new JwtService(), config);
    await db.subsystem.create({
      data: {
        id: "adcs",
        key: "ADCS",
        slug: "adcs",
        name: "ADCS",
        description: "fixture",
        color: "#000000",
      },
    });
    for (const id of ["owner", "member"]) {
      const user = await db.user.create({
        data: {
          id,
          name: id,
          email: `${id}@fixture.invalid`,
          role: id === "owner" ? "OWNER" : "MEMBER",
          passwordHash: "SENSITIVE-PASSWORD-SENTINEL",
        },
      });
      const credentials = await db.$transaction(async (tx) => {
        await lockAccounts(tx, [id]);
        return sessions.issue(tx, user);
      });
      if (id === "owner") ownerToken = credentials.accessToken;
      else memberToken = credentials.accessToken;
    }
    await db.subsystemMembership.create({
      data: { userId: "member", subsystemId: "adcs", accessLevel: "MEMBER" },
    });
    const module = await Test.createTestingModule({
      imports: [PassportModule, MetricsModule],
      controllers: [
        ResourcesController,
        UsersController,
        TasksController,
        WorklogsController,
        FilesController,
        CalendarController,
        DecisionsController,
        NotificationsController,
      ],
      providers: [
        AuthorizationService,
        CoreAuthorizationService,
        ResourcesService,
        {
          provide: AiService,
          useValue: { getWorkloadSuggestions: jest.fn(async () => []) },
        },
        { provide: AccountLifecycleService, useValue: {} },
        TasksService,
        WorklogsService,
        FilesService,
        CalendarService,
        DecisionsService,
        AuditService,
        UsersService,
        JwtStrategy,
        {
          provide: NotificationsService,
          useFactory: (queue: Queue) =>
            new NotificationsService(db, config, queue),
          inject: ["test-email-queue"],
        },
        { provide: PrismaService, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: SessionService, useValue: sessions },
        { provide: GoogleIntegrationService, useValue: google },
        { provide: TaskEventsService, useValue: events },
        { provide: "test-email-queue", useValue: { add: jest.fn() } },
      ],
    }).compile();
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
    const task = await db.task.create({
      data: {
        ...taskInput,
        priority: "HIGH",
        assignedById: "owner",
        deadline: new Date(taskInput.deadline),
      },
    });
    taskId = task.id;
  }, 60000);
  afterEach(() => {
    jest.restoreAllMocks();
    google.isCalendarConfigured.mockReturnValue(false);
    google.isDriveConfigured.mockReturnValue(true);
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (root && schema)
      await root.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await root?.$disconnect();
    if (temp) rmSync(temp, { recursive: true, force: true });
  });

  it.each(["assignedById", "createdById", "actorId"])(
    "rejects task spoof field %s",
    async (field) => {
      const before = await db.task.count();
      expect(
        (await request("/tasks", "POST", { ...taskInput, [field]: "member" }))
          .status,
      ).toBe(400);
      expect(await db.task.count()).toBe(before);
    },
  );
  it("creates a task with the real actor and unchanged assignee", async () => {
    const res = await request("/tasks", "POST", taskInput);
    expect(res.status).toBe(201);
    const json: { id: string; assignedById: string; assignedToId: string } =
      await res.json();
    expect(json.assignedById).toBe("owner");
    expect(json.assignedToId).toBe("member");
    expectSafeUsers(json);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: json.id } }))
        .assignedById,
    ).toBe("owner");
    expectSafeUsers(events.emitTaskUpdated.mock.calls);
  });
  it("rejects comment authorship spoofing", async () => {
    expect(
      (
        await request(
          `/tasks/${taskId}/comments`,
          "POST",
          { content: "test", authorId: "owner" },
          memberToken,
        )
      ).status,
    ).toBe(400);
  });
  it("stores comment actor and safely serializes/broadcasts author", async () => {
    const res = await request(
      `/tasks/${taskId}/comments`,
      "POST",
      { content: "real comment" },
      memberToken,
    );
    expect(res.status).toBe(201);
    const json: { authorId: string } = await res.json();
    expect(json.authorId).toBe("member");
    expectSafeUsers(json);
    expectSafeUsers(events.emitCommentAdded.mock.calls);
  });
  it.each(["/worklogs", "/worklogs/start"])(
    "rejects user spoofing at %s",
    async (route) => {
      const input = route.endsWith("start") ? { taskId } : worklogInput();
      expect(
        (
          await request(
            route,
            "POST",
            { ...input, userId: "owner" },
            memberToken,
          )
        ).status,
      ).toBe(400);
    },
  );
  it("stores manual worklog actor", async () => {
    const res = await request("/worklogs", "POST", worklogInput(), memberToken);
    expect(res.status).toBe(201);
    const json: { userId: string } = await res.json();
    expect(json.userId).toBe("member");
    expectSafeUsers(json);
  });
  it("starts/stops a persisted personal session; another actor cannot stop it", async () => {
    const res = await request(
      "/worklogs/start",
      "POST",
      { taskId },
      memberToken,
    );
    expect(res.status).toBe(201);
    const json: { id: string; userId: string } = await res.json();
    expect(json.userId).toBe("member");
    const stop = { endedAt: new Date().toISOString(), durationMin: 2 };
    expect((await request(`/worklogs/${json.id}/stop`, "PATCH", stop)).ok).toBe(
      false,
    );
    expect(
      (await db.workLog.findUniqueOrThrow({ where: { id: json.id } })).endedAt,
    ).toBeNull();
    expect(
      (await request(`/worklogs/${json.id}/stop`, "PATCH", stop, memberToken))
        .status,
    ).toBe(200);
  });
  it.each(["/worklogs", "/worklogs/start"])(
    "real FK failure at %s returns non-success and no row",
    async (route) => {
      const before = await db.workLog.count();
      const input = route.endsWith("start")
        ? { taskId: "missing" }
        : { ...worklogInput(), taskId: "missing" };
      const res = await request(route, "POST", input, memberToken);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        statusCode: 500,
        message: "Internal server error",
      });
      expect(await db.workLog.count()).toBe(before);
    },
  );
  it("stop database failure is not success", async () => {
    jest
      .spyOn(db.workLog, "update")
      .mockRejectedValueOnce(new Error("secret connection string"));
    const res = await request(
      `/worklogs/${taskId}/stop`,
      "PATCH",
      { endedAt: new Date().toISOString(), durationMin: 1 },
      memberToken,
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret");
  });
  it.each(["/tasks", "/worklogs"])(
    "safe nested response at %s",
    async (route) => {
      const res = await request(route);
      expect(res.status).toBe(200);
      const json: unknown = await res.json();
      expectSafeUsers(json);
      expect(JSON.stringify(json)).not.toContain("SENSITIVE-PASSWORD-SENTINEL");
    },
  );
  it("decision author comes from session and has a safe projection", async () => {
    const input = {
      title: "Fixture",
      context: "c",
      decision: "d",
      rationale: "r",
    };
    expect(
      (await request("/decisions", "POST", { ...input, authorId: "member" }))
        .status,
    ).toBe(400);
    const res = await request("/decisions", "POST", input);
    expect(res.status).toBe(201);
    const json: { authorId: string } = await res.json();
    expect(json.authorId).toBe("owner");
    expectSafeUsers(json);
    expectSafeUsers(await (await request("/decisions")).json());
  });
  it("safe user lookup/create/profile responses", async () => {
    const users = app.get(UsersService);
    expectSafe(await users.findById("owner"));
    expectSafe(await users.findByEmail("member@fixture.invalid"));
    expectSafe(
      await users.create({
        email: "new@fixture.invalid",
        name: "new",
        passwordHash: "secret",
      }),
    );
    expectSafe(
      await users.updateProfile("member", { skills: ["test"] }, "owner"),
    );
    expectSafe(await users.listMembers("owner"));
  });
  it("profile HTTP and resource reassignment never return full Users", async () => {
    const profile = await request("/users/member/profile", "PATCH", {
      skills: ["fixture"],
    });
    expect(profile.status).toBe(200);
    expectSafe(await profile.json());
    const move = await request(`/resources/tasks/${taskId}/assign`, "PATCH", {
      assigneeId: "member",
    });
    expect(move.status).toBe(200);
    expectSafeUsers(await move.json());
    const board = await request("/resources/allocation-board");
    expect(board.status).toBe(200);
    expectSafeUsers(await board.json());
  });
  it("rejects uploader spoofing before storage", async () => {
    expect(
      (
        await request("/files/attachments", "POST", {
          ...fileInput,
          uploadedById: "member",
        })
      ).status,
    ).toBe(400);
    expect(google.uploadDriveFile).not.toHaveBeenCalled();
  });
  it("missing content and unconfigured storage leave no ghost rows", async () => {
    const before = await db.attachment.count();
    const { contentBase64: omitted, ...metadata } = fileInput;
    expect((await request("/files/attachments", "POST", metadata)).status).toBe(
      400,
    );
    google.isDriveConfigured.mockReturnValue(false);
    expect(
      (await request("/files/attachments", "POST", fileInput)).status,
    ).toBe(503);
    expect(await db.attachment.count()).toBe(before);
  });
  it("storage failure creates no DB row", async () => {
    const before = await db.attachment.count();
    google.uploadDriveFile.mockRejectedValueOnce(new Error("provider secret"));
    const res = await request("/files/attachments", "POST", fileInput);
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("secret");
    expect(await db.attachment.count()).toBe(before);
  });
  it("metadata FK failure compensates successful upload and leaves no row", async () => {
    const before = await db.attachment.count();
    expect(
      (
        await request("/files/attachments", "POST", {
          ...fileInput,
          taskId: "missing",
        })
      ).status,
    ).toBe(500);
    expect(google.deleteDriveFile).toHaveBeenCalledWith("stored-drive-file");
    expect(await db.attachment.count()).toBe(before);
  });
  it("real upload metadata uses actor, actual size and safe uploader", async () => {
    const res = await request("/files/attachments", "POST", {
      ...fileInput,
      sizeBytes: 999,
    });
    expect(res.status).toBe(201);
    const json: {
      uploadedById: string;
      sizeBytes: number;
      storageUrl: string;
    } = await res.json();
    expect(json.uploadedById).toBe("owner");
    expect(json.sizeBytes).toBe(5);
    expect(json.storageUrl).not.toContain("local://");
    expectSafeUsers(json);
    expectSafeUsers(await (await request("/files/attachments")).json());
  });
  it("unconfigured Calendar still persists a real event with explicit status", async () => {
    const res = await request("/calendar/events", "POST", calendarInput);
    expect(res.status).toBe(201);
    const json: { id: string; integrationStatus: string } = await res.json();
    expect(json.integrationStatus).toBe("NOT_CONFIGURED");
    expect(
      await db.calendarEvent.findUnique({ where: { id: json.id } }),
    ).not.toBeNull();
  });
  it("configured provider failure creates no event", async () => {
    const before = await db.calendarEvent.count();
    google.isCalendarConfigured.mockReturnValue(true);
    google.createCalendarEvent.mockRejectedValueOnce(
      new Error("provider failed"),
    );
    expect(
      (await request("/calendar/events", "POST", calendarInput)).status,
    ).toBe(503);
    expect(await db.calendarEvent.count()).toBe(before);
  });
  it("Calendar DB failure is non-success and compensates provider event", async () => {
    google.isCalendarConfigured.mockReturnValue(true);
    jest
      .spyOn(db.calendarEvent, "create")
      .mockRejectedValueOnce(new Error("DB failed"));
    expect(
      (await request("/calendar/events", "POST", calendarInput)).status,
    ).toBe(500);
    expect(google.deleteCalendarEvent).toHaveBeenCalledWith("stored-event");
  });
  it("configured Calendar success links the real provider record", async () => {
    google.isCalendarConfigured.mockReturnValue(true);
    const res = await request("/calendar/events", "POST", calendarInput);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(
      expect.objectContaining({
        externalRef: "stored-event",
        integrationStatus: "SYNCED",
      }),
    );
  });
  it.each(["PATCH", "DELETE"])(
    "notification %s failure is not synthetic success",
    async (method) => {
      expect(
        (
          await request(
            "/notifications/missing",
            method,
            method === "PATCH" ? { isRead: true } : undefined,
          )
        ).status,
      ).toBe(500);
    },
  );
  it("metrics requires current OWNER session", async () => {
    expect((await request("/metrics", "GET", undefined, "")).status).toBe(401);
    expect(
      (await request("/metrics", "GET", undefined, memberToken)).status,
    ).toBe(403);
    expect((await request("/metrics")).status).toBe(200);
  });
  it("revoked session cannot act even with still-valid JWT", async () => {
    await app.get(SessionService).revokeAllSessions("member");
    expect(
      (await request("/worklogs", "POST", worklogInput(), memberToken)).status,
    ).toBe(401);
  });
});
