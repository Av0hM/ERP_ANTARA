import { Injectable } from "@nestjs/common";

import { GoogleIntegrationService } from "../../common/integrations/google.integration.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateCalendarEventDto } from "./dto/create-calendar-event.dto";

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleIntegration: GoogleIntegrationService,
  ) {}

  async list() {
    try {
      if (this.googleIntegration.isCalendarConfigured()) {
        const now = new Date();
        const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const googleEvents = await this.googleIntegration.listCalendarEvents({
          timeMin: now.toISOString(),
          timeMax: horizon.toISOString(),
          maxResults: 20,
        });

        if (googleEvents.length) {
          return googleEvents.map((event) => ({
            id: event.id,
            title: event.summary ?? "Untitled event",
            description: event.description ?? undefined,
            startsAt: event.start?.dateTime ?? now.toISOString(),
            endsAt: event.end?.dateTime ?? now.toISOString(),
            isRecurring: false,
            subsystem: null,
          }));
        }
      }

      return await this.prisma.calendarEvent.findMany({
        include: { subsystem: true },
        orderBy: { startsAt: "asc" },
      });
    } catch {
      return [
        {
          id: "c1",
          title: "Payload thermal review",
          description: "Cross-subsystem review before enclosure freeze.",
          startsAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
          endsAt: new Date(Date.now() + 1000 * 60 * 60 * 25).toISOString(),
          isRecurring: false,
          subsystem: { name: "Payload" },
        },
        {
          id: "c2",
          title: "Ground station rehearsal",
          description: "Run uplink/downlink mission rehearsal.",
          startsAt: new Date(Date.now() + 1000 * 60 * 60 * 48).toISOString(),
          endsAt: new Date(Date.now() + 1000 * 60 * 60 * 50).toISOString(),
          isRecurring: false,
          subsystem: { name: "Ground Station" },
        },
      ];
    }
  }

  async create(payload: CreateCalendarEventDto) {
    try {
      const subsystem = payload.subsystemId
        ? await this.prisma.subsystem.findUnique({
            where: { id: payload.subsystemId },
            select: { name: true },
          })
        : null;

      const googleEvent = await this.googleIntegration.createCalendarEvent({
        title: payload.title,
        description: payload.description,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        subsystemName: subsystem?.name ?? payload.subsystemId,
      });

      return await this.prisma.calendarEvent.create({
        data: {
          title: payload.title,
          description: payload.description,
          startsAt: new Date(payload.startsAt),
          endsAt: new Date(payload.endsAt),
          isRecurring: payload.isRecurring ?? false,
          externalRef: googleEvent?.id ?? null,
          ...(payload.subsystemId ? { subsystemId: payload.subsystemId } : {}),
        },
        include: { subsystem: true },
      });
    } catch {
      return {
        id: `calendar-${Date.now()}`,
        title: payload.title,
        description: payload.description,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
        isRecurring: payload.isRecurring ?? false,
        subsystem: payload.subsystemId ? { name: payload.subsystemId } : null,
      };
    }
  }
}
