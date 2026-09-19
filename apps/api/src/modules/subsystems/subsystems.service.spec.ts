import { TaskPriority, TaskStatus } from "@antara/contracts";

import { SubsystemsService } from "./subsystems.service";

describe("SubsystemsService", () => {
  const prisma = {
    subsystem: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    task: {
      findMany: jest.fn(),
    },
    workLog: {
      findMany: jest.fn(),
    },
    taskComment: {
      findMany: jest.fn(),
    },
  };

  let service: SubsystemsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SubsystemsService(prisma as never);
  });

  describe("getHealth", () => {
    it("returns health metrics for a subsystem", async () => {
      const now = new Date();
      const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      prisma.subsystem.findUnique.mockResolvedValue({
        id: "sub-1",
        name: "Software",
        slug: "software",
        color: "#3b82f6",
        users: [
          { id: "user-1", name: "Alice", availabilityScore: 80 },
          { id: "user-2", name: "Bob", availabilityScore: 60 },
        ],
      });

      prisma.task.findMany
        .mockResolvedValueOnce([
          {
            id: "task-1",
            title: "Task A",
            status: TaskStatus.COMPLETED,
            priority: TaskPriority.HIGH,
            deadline: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            estimatedHours: 4,
            dependencyIds: [],
            subsystemId: "sub-1",
            assignedToId: "user-1",
            assignedTo: { id: "user-1", name: "Alice", availabilityScore: 80 },
            subsystem: { name: "Software", slug: "software" },
          },
          {
            id: "task-2",
            title: "Task B",
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.MEDIUM,
            deadline: soon,
            estimatedHours: 8,
            dependencyIds: [],
            subsystemId: "sub-1",
            assignedToId: "user-1",
            assignedTo: { id: "user-1", name: "Alice", availabilityScore: 80 },
            subsystem: { name: "Software", slug: "software" },
          },
          {
            id: "task-3",
            title: "Task C",
            status: TaskStatus.BLOCKED,
            priority: TaskPriority.CRITICAL,
            deadline: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000),
            estimatedHours: 6,
            dependencyIds: [],
            subsystemId: "sub-1",
            assignedToId: "user-2",
            assignedTo: { id: "user-2", name: "Bob", availabilityScore: 60 },
            subsystem: { name: "Software", slug: "software" },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "task-1",
            title: "Task A",
            subsystemId: "sub-1",
            dependencyIds: [],
          },
          {
            id: "task-2",
            title: "Task B",
            subsystemId: "sub-1",
            dependencyIds: [],
          },
          {
            id: "task-3",
            title: "Task C",
            subsystemId: "sub-1",
            dependencyIds: [],
          },
        ]);

      prisma.workLog.findMany.mockResolvedValue([
        {
          id: "wl-1",
          durationMin: 120,
          startedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
          user: { name: "Alice" },
          task: { title: "Task A" },
        },
      ]);

      prisma.taskComment.findMany.mockResolvedValue([
        {
          id: "c-1",
          content: "Good progress",
          createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
          author: { name: "Bob" },
          task: { title: "Task B" },
        },
      ]);

      const result = await service.getHealth("software");

      expect(result.subsystem.name).toBe("Software");
      expect(result.subsystem.memberCount).toBe(2);
      expect(result.metrics.activeTaskCount).toBe(2);
      expect(result.metrics.completionRate).toBe(33);
      expect(result.metrics.overdueCount).toBe(0);
      expect(result.metrics.blockedCount).toBe(1);
      expect(result.workload).toHaveLength(2);
      expect(result.workload.find((w) => w.memberId === "user-1")?.activeTasks).toBe(1);
      expect(result.recentActivity).toHaveLength(2);
    });

    it("calculates incoming blockers from other subsystems", async () => {
      const now = new Date();

      prisma.subsystem.findUnique.mockResolvedValue({
        id: "sub-1",
        name: "Software",
        slug: "software",
        color: "#3b82f6",
        users: [{ id: "user-1", name: "Alice", availabilityScore: 80 }],
      });

      prisma.task.findMany
        .mockResolvedValueOnce([
          {
            id: "task-1",
            title: "Software Task",
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.HIGH,
            deadline: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
            estimatedHours: 4,
            dependencyIds: ["avionics-task"],
            subsystemId: "sub-1",
            assignedToId: "user-1",
            assignedTo: { id: "user-1", name: "Alice", availabilityScore: 80 },
            subsystem: { name: "Software", slug: "software" },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "task-1",
            title: "Software Task",
            subsystemId: "sub-1",
            dependencyIds: ["avionics-task"],
          },
          {
            id: "avionics-task",
            title: "Avionics Firmware",
            subsystemId: "sub-2",
            dependencyIds: [],
            subsystem: { name: "Avionics", slug: "avionics" },
          },
        ]);

      prisma.workLog.findMany.mockResolvedValue([]);
      prisma.taskComment.findMany.mockResolvedValue([]);

      const result = await service.getHealth("software");

      expect(result.incomingBlockers).toHaveLength(1);
      expect(result.incomingBlockers[0]?.fromSubsystem).toBe("Avionics");
      expect(result.incomingBlockers[0]?.blockingTask).toBe("Avionics Firmware");
    });

    it("calculates outgoing blockers to other subsystems", async () => {
      const now = new Date();

      prisma.subsystem.findUnique.mockResolvedValue({
        id: "sub-1",
        name: "Software",
        slug: "software",
        color: "#3b82f6",
        users: [{ id: "user-1", name: "Alice", availabilityScore: 80 }],
      });

      prisma.task.findMany
        .mockResolvedValueOnce([
          {
            id: "task-1",
            title: "Software Task",
            status: TaskStatus.IN_PROGRESS,
            priority: TaskPriority.HIGH,
            deadline: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
            estimatedHours: 4,
            dependencyIds: [],
            subsystemId: "sub-1",
            assignedToId: "user-1",
            assignedTo: { id: "user-1", name: "Alice", availabilityScore: 80 },
            subsystem: { name: "Software", slug: "software" },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "task-1",
            title: "Software Task",
            subsystemId: "sub-1",
            dependencyIds: [],
          },
          {
            id: "payload-task",
            title: "Payload Integration",
            subsystemId: "sub-3",
            dependencyIds: ["task-1"],
            subsystem: { name: "Payload", slug: "payload" },
          },
        ]);

      prisma.workLog.findMany.mockResolvedValue([]);
      prisma.taskComment.findMany.mockResolvedValue([]);

      const result = await service.getHealth("software");

      expect(result.outgoingBlockers).toHaveLength(1);
      expect(result.outgoingBlockers[0]?.toSubsystem).toBe("Payload");
      expect(result.outgoingBlockers[0]?.blockingTask).toBe("Software Task");
    });

    it("throws when subsystem not found", async () => {
      prisma.subsystem.findUnique.mockResolvedValue(null);

      await expect(service.getHealth("nonexistent")).rejects.toThrow("Subsystem not found: nonexistent");
    });
  });
});