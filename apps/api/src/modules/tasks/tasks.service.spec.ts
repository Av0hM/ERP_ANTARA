import { TaskPriority, TaskStatus } from "@antara/contracts";

import { TasksService } from "./tasks.service";

describe("TasksService", () => {
  const prisma = {
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(prisma as never, taskEvents as never, auditService as never);
  });

  it("emits a task update when a task is created", async () => {
    prisma.task.create.mockResolvedValue({
      id: "task-1",
      title: "Firmware telemetry packet validation",
      status: TaskStatus.TODO,
    });

    await service.create({
      title: "Firmware telemetry packet validation",
      description: "Validate CRC handling.",
      priority: TaskPriority.HIGH,
      subsystemId: "software",
      assignedById: "owner-1",
      assignedToId: "member-1",
      estimatedHours: 8,
      deadline: new Date().toISOString(),
      tags: ["firmware"],
      dependencyIds: [],
    }, "actor-1");

    expect(taskEvents.emitTaskUpdated).toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "CREATE",
        entityType: "Task",
        actorId: "actor-1",
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

      const result = await service.getDependencyGraph();

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

      const result = await service.getDependencyGraph("software");

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

      const result = await service.getDependencyGraph();

      expect(result.nodes.find((n) => n.id === "task-1")?.isCriticalPath).toBe(true);
      expect(result.nodes.find((n) => n.id === "task-2")?.isCriticalPath).toBe(true);
      expect(result.nodes.find((n) => n.id === "task-3")?.isCriticalPath).toBe(false);
    });

    it("handles empty task list", async () => {
      prisma.task.findMany.mockResolvedValue([]);

      const result = await service.getDependencyGraph();

      expect(result.nodes).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.criticalPath).toEqual([]);
    });
  });
});


