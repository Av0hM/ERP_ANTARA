import { canonicalSubsystems } from "@antara/contracts";
import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import {
  canReadSubsystem,
  canManageSubsystem,
} from "../../common/authorization/authorization.policy";
import { ForbiddenException } from "@nestjs/common";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { TaskStatus } from "@prisma/client";

import { PrismaService } from "../../common/prisma/prisma.service";
import { CalendarService } from "../calendar/calendar.service";
import { TasksService } from "../tasks/tasks.service";

interface MeetingAgenda {
  title: string;
  description: string;
  blockers: Array<{ taskId: string; title: string; subsystem: string }>;
  decisionsNeeded: Array<{ taskId: string; title: string; question: string }>;
  upcomingDeadlines: Array<{
    taskId: string;
    title: string;
    deadline: Date;
    subsystem: string;
  }>;
  actionItems: Array<{
    taskId: string;
    title: string;
    assignee: string;
    action: string;
  }>;
}

interface SubsystemSyncConfig {
  subsystemId: string;
  subsystemName: string;
  preferredDay: number; // 0-6 (Sunday-Saturday)
  preferredTime: string; // "HH:mm"
  durationMinutes: number;
  frequency: "weekly" | "biweekly";
}

@Injectable()
export class MeetingAutomationService implements OnModuleInit {
  private readonly syncConfigs: SubsystemSyncConfig[] = [
    {
      subsystemId: "software",
      subsystemName: "Software",
      preferredDay: 1,
      preferredTime: "10:00",
      durationMinutes: 60,
      frequency: "weekly",
    },
    {
      subsystemId: "avionics",
      subsystemName: "Avionics",
      preferredDay: 1,
      preferredTime: "14:00",
      durationMinutes: 60,
      frequency: "weekly",
    },
    {
      subsystemId: "structures",
      subsystemName: "Structures",
      preferredDay: 2,
      preferredTime: "10:00",
      durationMinutes: 45,
      frequency: "weekly",
    },
    {
      subsystemId: "payload",
      subsystemName: "Payload",
      preferredDay: 2,
      preferredTime: "14:00",
      durationMinutes: 60,
      frequency: "weekly",
    },
    {
      subsystemId: "communications",
      subsystemName: "Communications",
      preferredDay: 3,
      preferredTime: "10:00",
      durationMinutes: 45,
      frequency: "biweekly",
    },
    {
      subsystemId: "thermal",
      subsystemName: "Thermal",
      preferredDay: 3,
      preferredTime: "14:00",
      durationMinutes: 45,
      frequency: "biweekly",
    },
    {
      subsystemId: "ground-station",
      subsystemName: "Ground Station",
      preferredDay: 4,
      preferredTime: "10:00",
      durationMinutes: 60,
      frequency: "weekly",
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
    private readonly tasksService: TasksService,
    private readonly core: CoreAuthorizationService,
  ) {}

  async onModuleInit() {
    // Could schedule automatic sync here
  }

  async generateSubsystemSyncEvents(
    horizonWeeks = 4,
    actorId: string,
  ): Promise<
    Array<{
      subsystemId: string;
      subsystemName: string;
      events: Array<{
        title: string;
        description: string;
        startsAt: Date;
        endsAt: Date;
        agenda: MeetingAgenda;
      }>;
    }>
  > {
    const actor = await this.core.actor(actorId);
    horizonWeeks = Math.max(
      1,
      Math.min(12, Number.isFinite(horizonWeeks) ? horizonWeeks : 4),
    );
    const now = new Date();
    const horizon = new Date(
      now.getTime() + horizonWeeks * 7 * 24 * 60 * 60 * 1000,
    );

    const results = [];

    for (const config of this.syncConfigs) {
      if (!canReadSubsystem(actor, config.subsystemId)) continue;
      const subsystem = await this.prisma.subsystem.findFirst({
        where: {
          id: config.subsystemId,
          key: { in: canonicalSubsystems.map((subsystem) => subsystem.key) },
        },
      });
      if (!subsystem) continue;

      const events = await this.generateSyncEventsForSubsystem(
        config,
        subsystem,
        now,
        horizon,
        actorId,
      );
      results.push({
        subsystemId: config.subsystemId,
        subsystemName: config.subsystemName,
        events,
      });
    }

    return results;
  }

  private async generateSyncEventsForSubsystem(
    config: {
      subsystemId: string;
      subsystemName: string;
      preferredDay: number;
      preferredTime: string;
      durationMinutes: number;
      frequency: "weekly" | "biweekly";
    },
    subsystem: { id: string; name: string; color: string },
    now: Date,
    horizon: Date,
    actorId: string,
  ) {
    const events = [];
    let currentDate = new Date(now);

    // Find next occurrence of preferred day
    while (currentDate.getDay() !== config.preferredDay) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    while (currentDate < horizon) {
      const timeParts = config.preferredTime.split(":");
      const hours = Number(timeParts[0] ?? "0");
      const minutes = Number(timeParts[1] ?? "0");
      const startsAt = new Date(currentDate);
      startsAt.setHours(hours, minutes, 0, 0);

      const endsAt = new Date(startsAt);
      endsAt.setMinutes(endsAt.getMinutes() + (config.durationMinutes ?? 60));

      // Generate agenda for this sync
      const agenda = await this.generateMeetingAgenda(
        config.subsystemId,
        startsAt,
        actorId,
      );

      events.push({
        title: `${config.subsystemName} Sync`,
        description: agenda.description,
        startsAt,
        endsAt,
        agenda,
      });

      // Next occurrence
      const daysToAdd = config.frequency === "weekly" ? 7 : 14;
      currentDate.setDate(currentDate.getDate() + daysToAdd);
    }

    return events;
  }

  async generateMeetingAgenda(
    subsystemId: string,
    meetingDate: Date,
    actorId: string,
  ): Promise<MeetingAgenda> {
    const actor = await this.core.actor(actorId);
    if (!canReadSubsystem(actor, subsystemId))
      throw new ForbiddenException("Meeting access denied");
    const now = new Date();
    const weekAhead = new Date(meetingDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Fetch tasks for this subsystem and all tasks for cross-subsystem dependencies
    const tasks = await this.prisma.task.findMany({
      where: {
        subsystemId,
        deletedAt: null,
        isArchived: false,
        status: { not: TaskStatus.COMPLETED },
      },
      include: {
        subsystem: { select: { name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    // Blockers: tasks in this subsystem that are BLOCKED
    const blockers = tasks
      .filter((task) => task.status === TaskStatus.BLOCKED)
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        subsystem: task.subsystem?.name ?? "Unknown",
      }));

    // Decisions needed: tasks with high priority that need decisions
    const highPriorityTasks = tasks.filter(
      (t) => t.priority === "CRITICAL" || t.priority === "HIGH",
    );
    const decisionsNeeded = highPriorityTasks.slice(0, 3).map((t) => ({
      taskId: t.id,
      title: t.title,
      question: `Approve direction for ${t.title}? Priority: ${t.priority}, Deadline: ${t.deadline.toLocaleDateString()}`,
    }));

    // Upcoming deadlines in next 2 weeks
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = tasks
      .filter((t) => t.deadline >= now && t.deadline <= twoWeeks)
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 5)
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        deadline: t.deadline,
        subsystem: t.subsystem?.name ?? "Unknown",
      }));

    // Action items from recent decisions/comments
    const actionItems = tasks
      .filter(
        (task) =>
          task.status === TaskStatus.IN_PROGRESS ||
          task.status === TaskStatus.REVIEW,
      )
      .slice(0, 5)
      .map((task) => ({
        taskId: task.id,
        title: task.title,
        assignee: task.assignedTo?.name ?? "Unassigned",
        action:
          task.status === TaskStatus.IN_PROGRESS
            ? "Continue progress"
            : "Review and approve",
      }));

    return {
      title: `${tasks.length > 0 ? "Active" : "Empty"} Subsystem Sync`,
      description: `Weekly sync for subsystem with ${tasks.length} active tasks. ${tasks.filter((t) => t.status === TaskStatus.BLOCKED).length} blockers, ${highPriorityTasks.length} high-priority items.`,
      blockers,
      decisionsNeeded,
      upcomingDeadlines,
      actionItems,
    };
  }

  async createSyncCalendarEvents(
    subsystemId: string,
    horizonWeeks = 4,
    actorId: string,
  ) {
    const actor = await this.core.actor(actorId);
    if (!canManageSubsystem(actor, subsystemId))
      throw new ForbiddenException("Meeting management denied");
    const results = await this.generateSubsystemSyncEvents(
      horizonWeeks,
      actorId,
    );
    const subsystemResult = results.find((r) => r.subsystemId === subsystemId);

    if (!subsystemResult || subsystemResult.events.length === 0) {
      return {
        created: 0,
        events: [],
        unavailable: "REVIEWED_SYNC_SCHEDULE_REQUIRED",
      };
    }

    const created: Array<{ id: string; title: string }> = [];
    for (const event of subsystemResult.events) {
      {
        const createdEvent = await this.calendarService.create(
          {
            title: event.title,
            description: event.agenda.description,
            startsAt: event.startsAt.toISOString(),
            endsAt: event.endsAt.toISOString(),
            subsystemId,
          },
          actorId,
        );
        created.push(createdEvent);
      }
    }

    // Log audit
    // await this.auditService.log({
    //   action: "SYNC_EVENTS_CREATED",
    //   entityType: "CalendarEvent",
    //   entityId: subsystemId,
    //   actorId,
    //   payload: { count: created.length, subsystemId },
    // });

    return { created: created.length, events: created };
  }

  async generateAgendaMarkdown(agenda: MeetingAgenda): Promise<string> {
    let md = `# ${agenda.title}\n\n`;
    md += `**Date:** ${new Date().toLocaleDateString()}\n\n`;
    md += `${agenda.description}\n\n`;

    if (agenda.blockers.length > 0) {
      md += `## 🚫 Blockers (${agenda.blockers.length})\n\n`;
      for (const blocker of agenda.blockers) {
        md += `- **${blocker.title}** (${blocker.subsystem}) - [Task #${blocker.taskId.slice(0, 8)}]\n`;
      }
      md += "\n";
    }

    if (agenda.decisionsNeeded.length > 0) {
      md += `## ❓ Decisions Needed (${agenda.decisionsNeeded.length})\n\n`;
      for (const decision of agenda.decisionsNeeded) {
        md += `- **${decision.title}**: ${decision.question}\n`;
      }
      md += "\n";
    }

    if (agenda.upcomingDeadlines.length > 0) {
      md += `## ⏰ Upcoming Deadlines (${agenda.upcomingDeadlines.length})\n\n`;
      for (const deadline of agenda.upcomingDeadlines) {
        md += `- **${deadline.title}** (${deadline.subsystem}) - Due: ${deadline.deadline.toLocaleDateString()}\n`;
      }
      md += "\n";
    }

    if (agenda.actionItems.length > 0) {
      md += `## ✅ Action Items (${agenda.actionItems.length})\n\n`;
      for (const action of agenda.actionItems) {
        md += `- **${action.title}** (${action.assignee}): ${action.action}\n`;
      }
      md += "\n";
    }

    md += `---\n*Generated by ANTARA ERP Meeting Automation*`;
    return md;
  }
}
