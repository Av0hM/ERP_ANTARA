import { TaskEventsService } from "./events/task-events.service";
import { AuditService } from "../audit/audit.service";
import { Test } from "@nestjs/testing";
import { AuthorizationService } from "../../common/authorization/authorization.service";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { TaskPriority, TaskStatus } from "@antara/contracts";

import { TasksService } from "./tasks.service";

describe("TasksService", () => {
  const prisma = {
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    auditLog: { create: jest.fn() },
    task: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    taskComment: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const taskEvents = {
    emitTaskUpdated: jest.fn(),
    emitCommentAdded: jest.fn(),
  };

  const auditService = {
    log: jest.fn().mockResolvedValue(null),
  };

  let service: TasksService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.user.findFirst.mockResolvedValue({ id: "member-1" });
    prisma.user.findUnique.mockResolvedValue({
      id: "owner",
      role: "OWNER",
      isActive: true,
      deletedAt: null,
      memberships: [],
    });
    prisma.$transaction.mockImplementation(
      (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    );
    const module = await Test.createTestingModule({
      providers: [
        TasksService,
        AuthorizationService,
        CoreAuthorizationService,
        { provide: PrismaService, useValue: prisma },
        { provide: TaskEventsService, useValue: taskEvents },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();
    service = module.get(TasksService);
  });

  it("emits a task update when a task is created", async () => {
    prisma.task.create.mockResolvedValue({
      id: "task-1",
      title: "Firmware telemetry packet validation",
      status: TaskStatus.TODO,
      dependencyIds: [],
      subsystemId: "adcs",
      assignedToId: "member-1",
    });

    await service.create(
      {
        title: "Firmware telemetry packet validation",
        description: "Validate CRC handling.",
        priority: TaskPriority.HIGH,
        subsystemId: "software",
        assignedToId: "member-1",
        estimatedHours: 8,
        deadline: new Date().toISOString(),
        tags: ["firmware"],
        dependencyIds: [],
      },
      "actor-1",
    );

    expect(taskEvents.emitTaskUpdated).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CREATE",
          entityType: "Task",
          actorId: "actor-1",
        }),
      }),
    );
  });

  describe("getDependencyGraph", () => {
    it("returns nodes and edges for tasks with dependencies", async () => {
      const now = new Date();
      prisma.task.findMany.mockResolvedValue([
        {
          id: "task-1",
          title: "Task A",
          status: TaskStatus.TODO,
          priority: TaskPriority.HIGH,
          estimatedHours: 4,
          dependencyIds: [],
          subsystem: { name: "Software" },
          assignedTo: { id: "user-1", name: "Alice" },
        },
        {
          id: "task-2",
          title: "Task B",
          status: TaskStatus.IN_PROGRESS,
          priority: TaskPriority.MEDIUM,
          estimatedHours: 8,
          dependencyIds: ["task-1"],
          subsystem: { name: "Software" },
          assignedTo: { id: "user-2", name: "Bob" },
        },
        {
          id: "task-3",
          title: "Task C",
          status: TaskStatus.BLOCKED,
          priority: TaskPriority.CRITICAL,
          estimatedHours: 6,
          dependencyIds: ["task-2"],
          subsystem: { name: "Avionics" },
          assignedTo: { id: "user-3", name: "Carol" },
        },
      ]);

      const result = await service.getDependencyGraph("owner");

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);
      expect(result.edges).toEqual(
        expect.arrayContaining([
          { from: "task-1", to: "task-2", type: "blocks" },
          { from: "task-2", to: "task-3", type: "blocks" },
        ]),
      );
      expect(result.criticalPath).toEqual(["task-1", "task-2", "task-3"]);
    });

    it("filters by subsystem when provided", async () => {
      prisma.task.findMany.mockResolvedValue([
        {
          id: "task-1",
          title: "Software Task",
          status: TaskStatus.TODO,
          priority: TaskPriority.HIGH,
          estimatedHours: 4,
          dependencyIds: [],
          subsystem: { name: "Software" },
          assignedTo: { id: "user-1", name: "Alice" },
        },
      ]);

      const result = await service.getDependencyGraph("owner", "software");

      expect(prisma.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ subsystemId: "software" }),
        }),
      );
      expect(result.nodes).toHaveLength(1);
    });

    it("marks critical path nodes correctly", async () => {
      prisma.task.findMany.mockResolvedValue([
        {
          id: "task-1",
          title: "A",
          status: TaskStatus.TODO,
          priority: TaskPriority.LOW,
          estimatedHours: 2,
          dependencyIds: [],
          subsystem: { name: "Software" },
          assignedTo: null,
        },
        {
          id: "task-2",
          title: "B",
          status: TaskStatus.TODO,
          priority: TaskPriority.LOW,
          estimatedHours: 10,
          dependencyIds: ["task-1"],
          subsystem: { name: "Software" },
          assignedTo: null,
        },
        {
          id: "task-3",
          title: "C",
          status: TaskStatus.TODO,
          priority: TaskPriority.LOW,
          estimatedHours: 2,
          dependencyIds: [],
          subsystem: { name: "Software" },
          assignedTo: null,
        },
      ]);

      const result = await service.getDependencyGraph("owner");

      expect(result.nodes.find((n) => n.id === "task-1")?.isCriticalPath).toBe(
        true,
      );
      expect(result.nodes.find((n) => n.id === "task-2")?.isCriticalPath).toBe(
        true,
      );
      expect(result.nodes.find((n) => n.id === "task-3")?.isCriticalPath).toBe(
        false,
      );
    });

    it("handles empty task list", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      const result = await service.getDependencyGraph("owner");

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.criticalPath).toEqual([]);
    });
  });
});
