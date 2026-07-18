import { TaskPriority, TaskStatus } from "@antara/contracts";

import { TasksService } from "./tasks.service";

describe("TasksService", () => {
  const prisma = {
    task: {
      create: jest.fn(),
      update: jest.fn(),
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

  let service: TasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(prisma as never, taskEvents as never);
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
    });

    expect(taskEvents.emitTaskUpdated).toHaveBeenCalled();
  });
});


