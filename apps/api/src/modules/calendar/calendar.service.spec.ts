import { CalendarService } from "./calendar.service";

describe("CalendarService", () => {
  const prisma = {
    subsystem: {
      findUnique: jest.fn(),
    },
    calendarEvent: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  const googleIntegration = {
    isCalendarConfigured: jest.fn(),
    listCalendarEvents: jest.fn(),
    createCalendarEvent: jest.fn(),
  };

  let service: CalendarService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CalendarService(prisma as never, googleIntegration as never);
  });

  it("falls back to prisma events when google calendar is unavailable", async () => {
    googleIntegration.isCalendarConfigured.mockReturnValue(false);
    prisma.calendarEvent.findMany.mockResolvedValue([
      {
        id: "event-1",
        title: "Integration review",
        startsAt: new Date().toISOString(),
      },
    ]);

    await expect(service.list()).resolves.toHaveLength(1);
  });

  it("creates a calendar event with google sync metadata when configured", async () => {
    googleIntegration.createCalendarEvent.mockResolvedValue({
      id: "google-event-1",
    });
    prisma.subsystem.findUnique.mockResolvedValue({
      name: "Payload",
    });
    prisma.calendarEvent.create.mockResolvedValue({
      id: "calendar-1",
      title: "Payload review",
    });

    await service.create({
      title: "Payload review",
      description: "Review payload fit checks.",
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      subsystemId: "payload",
      isRecurring: false,
    });

    expect(googleIntegration.createCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        subsystemName: "Payload",
      }),
    );
    expect(prisma.calendarEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          externalRef: "google-event-1",
          subsystemId: "payload",
        }),
      }),
    );
  });
});
