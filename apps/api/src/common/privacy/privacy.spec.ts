import { storageFixture } from "../../../test/storage.fixture";
import { StorageRouter } from "../storage/storage.router";
import { StorageConfig } from "../storage/storage.config";
import { AuthorizationService } from "../authorization/authorization.service";
import { CoreAuthorizationService } from "../authorization/core-authorization.service";
import { Test } from "@nestjs/testing";
import { ValidationPipe, BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TaskPriority } from "@antara/contracts";
import {
  safeUserSelect,
  memberProfileSelect,
} from "../prisma/safe-user.select";
import { PrismaService } from "../prisma/prisma.service";
import { TasksService } from "../../modules/tasks/tasks.service";
import { TaskEventsService } from "../../modules/tasks/events/task-events.service";
import { AuditService } from "../../modules/audit/audit.service";
import { WorklogsService } from "../../modules/worklogs/worklogs.service";
import { CreateTaskDto } from "../../modules/tasks/dto/create-task.dto";
import { CreateTaskCommentDto } from "../../modules/tasks/dto/create-task-comment.dto";
import { CreateWorklogDto } from "../../modules/worklogs/dto/create-worklog.dto";
import { CreateAttachmentDto } from "../../modules/files/dto/create-attachment.dto";
import { FilesService } from "../../modules/files/files.service";
import { GoogleIntegrationService } from "../integrations/google.integration.service";
import { MeetingsController } from "../../modules/meetings/meetings.controller";
import { MeetingAutomationService } from "../../modules/meetings/meetings.service";

// Use Prisma's model metadata, so nested relations are checked by their model,
// not by a regex or a fixed set of relation aliases.
function assertProjected(model: string, args: unknown): void {
  const shape = Prisma.dmmf.datamodel.models.find(
    (item) => item.name === model,
  );
  if (!shape || !args || typeof args !== "object")
    throw new Error("Invalid projection");
  const record: Record<string, unknown> = Object.fromEntries(
    Object.entries(args),
  );
  if (model === "User") {
    if (!record.select || typeof record.select !== "object")
      throw new Error("Unprojected User");
    const allowed = new Set([
      "id",
      "name",
      "avatarUrl",
      "email",
      "role",
      "skills",
      "weeklyCapacityHours",
      "availabilityScore",
      "subsystemId",
      "subsystem",
    ]);
    for (const [field, selected] of Object.entries(record.select))
      if (selected && !allowed.has(field))
        throw new Error(`Unsafe User field: ${field}`);
  }
  for (const branch of [record.include, record.select]) {
    if (!branch || typeof branch !== "object") continue;
    for (const [name, selection] of Object.entries(branch)) {
      const field = shape.fields.find(
        (item) => item.name === name && item.kind === "object",
      );
      if (!field || !selection) continue;
      if (selection === true && field.type === "User")
        throw new Error("Unprojected User relation");
      if (typeof selection === "object") assertProjected(field.type, selection);
    }
  }
}

describe("Phase 3 projections, identity and truthful errors", () => {
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    auditLog: { create: jest.fn() },
    task: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    taskComment: { create: jest.fn(), findMany: jest.fn() },
    workLog: { create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    attachment: { create: jest.fn(), findMany: jest.fn() },
  };
  const google = {
    isDriveConfigured: jest.fn(() => true),
    uploadDriveFile: jest.fn(),
    deleteDriveFile: jest.fn(),
  };
  let tasks: TasksService;
  let worklogs: WorklogsService;
  let files: FilesService;
  let meetings: MeetingsController;
  beforeEach(async () => {
    jest.resetAllMocks();
    google.isDriveConfigured.mockReturnValue(true);
    prisma.workLog.findMany.mockResolvedValue([]);
    prisma.attachment.findMany.mockResolvedValue([]);
    prisma.user.findUnique.mockResolvedValue({
      id: "real",
      role: "OWNER",
      isActive: true,
      deletedAt: null,
      memberships: [],
    });
    prisma.user.findFirst.mockResolvedValue({ id: "assignee" });
    prisma.task.findUnique.mockResolvedValue({
      id: "t",
      subsystemId: "s",
      deletedAt: null,
      isArchived: false,
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );
    const module = await Test.createTestingModule({
      controllers: [MeetingsController],
      providers: [
        AuthorizationService,
        CoreAuthorizationService,
        TasksService,
        WorklogsService,
        FilesService,
        { provide: MeetingAutomationService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        {
          provide: TaskEventsService,
          useValue: { emitTaskUpdated: jest.fn(), emitCommentAdded: jest.fn() },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: GoogleIntegrationService, useValue: google },
        {
          provide: StorageRouter,
          useFactory: () => storageFixture(google).router,
        },
        { provide: StorageConfig, useFactory: () => storageFixture().config },
      ],
    }).compile();
    tasks = module.get(TasksService);
    worklogs = module.get(WorklogsService);
    files = module.get(FilesService);
    meetings = module.get(MeetingsController);
  });
  it("shared selects contain no auth-only fields", () => {
    assertProjected("User", { select: safeUserSelect });
    assertProjected("User", { select: memberProfileSelect });
    expect(Object.keys(safeUserSelect).sort()).toEqual([
      "avatarUrl",
      "id",
      "name",
    ]);
  });
  it("schema-aware regression helper detects raw nested users and added secrets", () => {
    expect(() =>
      assertProjected("Task", {
        include: { comments: { include: { author: true } } },
      }),
    ).toThrow("Unprojected");
    expect(() =>
      assertProjected("User", {
        select: { ...safeUserSelect, passwordHash: true },
      }),
    ).toThrow("Unsafe");
  });
  it("all task/comment mutation and list projections are safe", async () => {
    prisma.task.findMany.mockResolvedValue([]);
    prisma.taskComment.findMany.mockResolvedValue([]);
    prisma.task.create.mockResolvedValue({
      id: "t",
      title: "t",
      dependencyIds: [],
      subsystemId: "s",
      assignedToId: "target",
    });
    prisma.task.update.mockResolvedValue({
      id: "t",
      dependencyIds: [],
      subsystemId: "s",
      assignedToId: "target",
    });
    prisma.taskComment.create.mockResolvedValue({ id: "c" });
    const crafted = {
      title: "t",
      description: "d",
      priority: TaskPriority.HIGH,
      subsystemId: "s",
      assignedToId: "target",
      assignedById: "spoof",
      estimatedHours: 1,
      deadline: new Date().toISOString(),
    };
    await tasks.create(crafted, "real");
    await tasks.findAll("real");
    await tasks.getActivityFeed("real");
    await tasks.reassign("t", "target", "real");
    const comment = { content: "c", authorId: "spoof" };
    await tasks.addComment("t", comment, "real");
    for (const method of [
      prisma.task.create,
      prisma.task.update,
      prisma.task.findMany,
    ])
      for (const [args] of method.mock.calls) assertProjected("Task", args);
    for (const method of [
      prisma.taskComment.create,
      prisma.taskComment.findMany,
    ])
      for (const [args] of method.mock.calls)
        assertProjected("TaskComment", args);
    expect(prisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedById: "real",
          assignedToId: "target",
        }),
      }),
    );
    expect(prisma.taskComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ authorId: "real" }),
      }),
    );
  });
  it("worklog and file list projections are safe", async () => {
    await worklogs.list("real");
    await files.list("real");
    assertProjected("WorkLog", prisma.workLog.findMany.mock.calls[0]?.[0]);
    assertProjected(
      "Attachment",
      prisma.attachment.findMany.mock.calls[0]?.[0],
    );
  });
  it.each([
    CreateTaskDto,
    CreateTaskCommentDto,
    CreateWorklogDto,
    CreateAttachmentDto,
  ])("external DTO rejects crafted actor fields: %p", async (dto) => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        {
          authorId: "spoof",
          userId: "spoof",
          assignedById: "spoof",
          uploadedById: "spoof",
        },
        { type: "body", metatype: dto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it("worklog direct service ignores extra caller identity", async () => {
    const input = {
      userId: "spoof",
      taskId: "t",
      startedAt: new Date().toISOString(),
      durationMin: 1,
    };
    await worklogs.create(input, "real");
    await worklogs.startSession(input, "real");
    for (const [args] of prisma.workLog.create.mock.calls)
      expect(args.data.userId).toBe("real");
  });
  it.each(["create", "start", "stop", "list", "summary"])(
    "worklog %s failure propagates",
    async (operation) => {
      const error = new Error("DB failed");
      prisma.workLog.create.mockRejectedValue(error);
      prisma.workLog.update.mockRejectedValue(error);
      prisma.workLog.findMany.mockRejectedValue(error);
      const input = {
        taskId: "t",
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMin: 1,
      };
      const operations = {
        create: () => worklogs.create(input, "real"),
        start: () => worklogs.startSession(input, "real"),
        stop: () => worklogs.stopSession("w", input, "real"),
        list: () => worklogs.list("real"),
        summary: () => worklogs.summary("real"),
      };
      await expect(
        operations[operation as keyof typeof operations](),
      ).rejects.toBe(error);
    },
  );
  it("malformed provider success cannot create a ghost attachment", async () => {
    google.uploadDriveFile.mockResolvedValue({});
    await expect(
      files.create(
        {
          name: "a",
          mimeType: "text/plain",
          sizeBytes: 1,
          contentBase64: "YQ==",
        },
        "real",
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(prisma.attachment.create).not.toHaveBeenCalled();
  });
  it("meeting action items explicitly reject unimplemented persistence", async () => {
    // Parameters are intentionally unused: this route must not pretend to write.
    const request = Object.assign(new Request("http://localhost"), {
      user: { id: "real", email: "a@b.test", name: "a", role: "MEMBER" },
    });
    await expect(
      meetings.createActionItems({ meetingId: "m", items: [] }, request),
    ).rejects.toMatchObject({ status: 501 });
  });
});
