import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import {
  canManageSubsystem,
  readableSubsystemIds,
} from "../../common/authorization/authorization.policy";
import { ForbiddenException } from "@nestjs/common";
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
    private readonly core: CoreAuthorizationService,
  ) {}

  // Persisted ERP events remain visible even when Google is unavailable.
  async list(actorId: string) {
    const actor = await this.core.actor(actorId);
    const scope = readableSubsystemIds(actor);
    return this.prisma.calendarEvent.findMany({
      where:
        scope.kind === "GLOBAL" ? {} : { subsystemId: { in: [...scope.ids] } },
      include: { subsystem: true },
      orderBy: { startsAt: "asc" },
    });
  }

  async create(payload: CreateCalendarEventDto, actorId: string) {
    const authorize = async () => {
      const actor = await this.core.actor(actorId);
      if (
        payload.subsystemId
          ? !canManageSubsystem(actor, payload.subsystemId)
          : !actor.globalAuthority
      )
        throw new ForbiddenException("Calendar management denied");
    };
    await authorize();
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
      const event = await this.core.withActor(actorId, async (tx, actor) => {
        if (
          payload.subsystemId
            ? !canManageSubsystem(actor, payload.subsystemId)
            : !actor.globalAuthority
        )
          throw new ForbiddenException("Calendar management denied");
        const saved = await tx.calendarEvent.create({
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
        await tx.auditLog.create({
          data: {
            action: "CREATE",
            entityType: "CalendarEvent",
            entityId: saved.id,
            actorId,
            payload: { subsystemId: saved.subsystemId },
          },
        });
        return saved;
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
