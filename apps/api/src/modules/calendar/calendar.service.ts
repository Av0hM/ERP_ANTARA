import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import { GoogleIntegrationService } from "../../common/integrations/google.integration.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CreateCalendarEventDto } from "./dto/create-calendar-event.dto";

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleIntegration: GoogleIntegrationService,
  ) {}

  // Persisted ERP events remain visible even when Google is unavailable.
  list() {
    return this.prisma.calendarEvent.findMany({
      include: { subsystem: true },
      orderBy: { startsAt: "asc" },
    });
  }

  async create(payload: CreateCalendarEventDto) {
    const subsystem = payload.subsystemId
      ? await this.prisma.subsystem.findUniqueOrThrow({
          where: { id: payload.subsystemId },
          select: { name: true },
        })
      : null;
    const configured = this.googleIntegration.isCalendarConfigured();
    let externalRef: string | null = null;
    if (configured) {
      try {
        const event = await this.googleIntegration.createCalendarEvent({
          ...payload,
          subsystemName: subsystem?.name,
        });
        if (!event?.id) throw new Error("Missing provider event ID");
        externalRef = event.id;
      } catch {
        throw new ServiceUnavailableException({
          code: "CALENDAR_PROVIDER_UNAVAILABLE",
          message: "Calendar integration unavailable; event was not saved",
        });
      }
    }
    try {
      const event = await this.prisma.calendarEvent.create({
        data: {
          title: payload.title,
          description: payload.description,
          startsAt: new Date(payload.startsAt),
          endsAt: new Date(payload.endsAt),
          isRecurring: payload.isRecurring ?? false,
          subsystemId: payload.subsystemId,
          externalRef,
        },
        include: { subsystem: true },
      });
      return {
        ...event,
        integrationStatus: configured ? "SYNCED" : "NOT_CONFIGURED",
      };
    } catch (error) {
      if (externalRef) {
        try {
          await this.googleIntegration.deleteCalendarEvent(externalRef);
        } catch {
          this.logger.error(
            "Calendar compensation failed; provider reconciliation required",
          );
        }
      }
      throw error;
    }
  }
}
