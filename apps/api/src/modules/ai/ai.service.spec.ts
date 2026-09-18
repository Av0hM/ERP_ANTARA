import { InsightSeverity, TaskPriority, TaskStatus } from "@antara/contracts";

import { AiService } from "./ai.service";

describe("AiService", () => {
  const prisma = {
    task: {
      findMany: jest.fn(),
    },
    aIInsight: {
      findMany: jest.fn(),
      createMany: jest.fn(),
    },
    workLog: {
      findMany: jest.fn(),
    },
    calendarEvent: {
      findMany: jest.fn(),
    },
    subsystem: {
      findMany: jest.fn(),
    },
  };
  const cache = {
    getJson: jest.fn(),
    setJson: jest.fn(),
  };

  const openAiIntegration = {
    summarize: jest.fn(),
  };

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache.getJson.mockResolvedValue(null);
    cache.setJson.mockResolvedValue(undefined);
    service = new AiService(prisma as never, openAiIntegration as never, cache as never);
  });

  it("derives high-risk insights from overdue and blocked tasks", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-overdue",
        title: "Flight software HIL validation",
        priority: TaskPriority.CRITICAL,
        status: TaskStatus.IN_PROGRESS,
        deadline: new Date(Date.now() - 4 * 60 * 60 * 1000),
        dependencyIds: [],
        estimatedHours: 12,
        subsystem: { name: "Software" },
        assignedTo: { id: "u1", name: "Aditi Rao", availabilityScore: 55 },
      },
      {
        id: "task-blocked",
        title: "EPS interface review",
        priority: TaskPriority.HIGH,
        status: TaskStatus.BLOCKED,
        deadline: new Date(Date.now() + 12 * 60 * 60 * 1000),
        dependencyIds: ["dep-1", "dep-2"],
        estimatedHours: 6,
        subsystem: { name: "Avionics" },
        assignedTo: { id: "u1", name: "Aditi Rao", availabilityScore: 55 },
      },
      {
        id: "task-light",
        title: "Ops checklist tidy-up",
        priority: TaskPriority.LOW,
        status: TaskStatus.TODO,
        deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        dependencyIds: [],
        estimatedHours: 2,
        subsystem: { name: "Ground Station" },
        assignedTo: { id: "u2", name: "Ishaan Patel", availabilityScore: 90 },
      },
    ]);
    prisma.aIInsight.findMany.mockResolvedValue([]);
    prisma.workLog.findMany.mockResolvedValue([
      {
        durationMin: 540,
        userId: "u1",
        user: { name: "Aditi Rao" },
      },
    ]);
    prisma.subsystem.findMany.mockResolvedValue([
      { id: "sub-software", name: "Software" },
      { id: "sub-avionics", name: "Avionics" },
      { id: "sub-ground", name: "Ground Station" },
    ]);

    const insights = await service.getInsights();

    expect(insights.length).toBeGreaterThan(0);
    expect(insights[0]?.severity).toBe(InsightSeverity.CRITICAL);
    expect(insights.some((item) => item.title.includes("deadline slip risk"))).toBe(true);
    expect(insights.some((item) => item.title.includes("Dependency chain blockage"))).toBe(true);
    expect(prisma.aIInsight.createMany).toHaveBeenCalled();
  });

  it("creates workload suggestions from subsystem imbalance", async () => {
    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        title: "Firmware integration",
        priority: TaskPriority.HIGH,
        status: TaskStatus.IN_PROGRESS,
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        dependencyIds: [],
        estimatedHours: 14,
        subsystem: { name: "Software" },
        assignedTo: { id: "u1", name: "Aditi Rao", availabilityScore: 70 },
      },
      {
        id: "task-2",
        title: "Simulation cleanup",
        priority: TaskPriority.MEDIUM,
        status: TaskStatus.TODO,
        deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        dependencyIds: [],
        estimatedHours: 10,
        subsystem: { name: "Software" },
        assignedTo: { id: "u2", name: "Rohan Mehta", availabilityScore: 72 },
      },
      {
        id: "task-3",
        title: "Review note formatting",
        priority: TaskPriority.LOW,
        status: TaskStatus.TODO,
        deadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
        dependencyIds: [],
        estimatedHours: 2,
        subsystem: { name: "Structures" },
        assignedTo: { id: "u3", name: "Sara Khan", availabilityScore: 85 },
      },
    ]);

    const suggestions = await service.getWorkloadSuggestions();

    expect(suggestions[0]?.from).toBe("Software");
    expect(suggestions[0]?.to).toBe("Structures");
  });

  it("uses the live OpenAI adapter when text summarization is requested", async () => {
    openAiIntegration.summarize.mockResolvedValue("Summarized technical update.");

    await expect(
      service.summarizeText({
        text: "Telemetry packet checksum validation passed after retry logic adjustments.",
        context: "Sprint review",
      }),
    ).resolves.toEqual({
      summary: "Summarized technical update.",
      source: "openai",
    });
  });
});

