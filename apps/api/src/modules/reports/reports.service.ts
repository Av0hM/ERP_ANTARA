import { CoreAuthorizationService } from "../../common/authorization/core-authorization.service";
import { Injectable } from "@nestjs/common";
import { TaskStatus } from "@antara/contracts";

import { PrismaService } from "../../common/prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { CalendarService } from "../calendar/calendar.service";
import { TasksService } from "../tasks/tasks.service";
import { AuditService } from "../audit/audit.service";

interface HandoffPackage {
  metadata: {
    generatedAt: Date;
    generatedBy: string;
    clubName: string;
    semester: string;
    historicalAnalytics: "UNAVAILABLE_PENDING_SCOPE_REVIEW";
  };
  clubHealth: {
    productivityIndex: number;
    subsystemVelocity: number;
    overdueRate: number;
    clubHealthScore: number;
    memberCount: number;
    activeTaskCount: number;
  };
  subsystemStatus: Array<{
    name: string;
    slug: string;
    color: string;
    memberCount: number;
    activeTasks: number;
    completedTasks: number;
    overdueTasks: number;
    blockedTasks: number;
    velocity: number;
    riskScore: number;
    upcomingDeadlines: Array<{
      id: string;
      title: string;
      deadline: Date;
      priority: string;
    }>;
    keyContacts: Array<{
      name: string;
      email: string;
      role: string;
      subsystem: string;
    }>;
  }>;
  riskRegister: Array<{
    id: string;
    title: string;
    severity: string;
    subsystem: string;
    summary: string;
    recommendation: string;
    riskScore: number;
  }>;
  openDecisions: Array<{
    id: string;
    title: string;
    status: string;
    subsystem: string;
    context: string;
    decision: string;
    rationale: string;
    createdAt: Date;
  }>;
  milestoneTracker: Array<{
    name: string;
    date: Date;
    type: string;
    subsystem: string;
    requiredTasks: string[];
    status: "pending" | "in-progress" | "completed";
  }>;
  keyContacts: Array<{
    name: string;
    email: string;
    role: string;
    subsystem: string;
    phone?: string;
  }>;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly calendarService: CalendarService,
    private readonly tasksService: TasksService,
    private readonly auditService: AuditService,
    private readonly core: CoreAuthorizationService,
  ) {}

  async generateHandoffPackage(
    actorId: string,
    subsystemId?: string,
  ): Promise<HandoffPackage> {
    const actor = await this.core.actor(actorId);
    const scope = this.core.managementScope(actor, subsystemId);
    const ids = scope.kind === "SCOPED" ? [...scope.ids] : [];
    const placement =
      scope.kind === "GLOBAL" ? {} : { subsystemId: { in: ids } };
    const [identity, subsystems, users, tasks, decisions, events] =
      await Promise.all([
        this.prisma.user.findUniqueOrThrow({
          where: { id: actorId },
          select: { name: true },
        }),
        this.prisma.subsystem.findMany({
          where: scope.kind === "GLOBAL" ? {} : { id: { in: ids } },
          select: { id: true, name: true, slug: true, color: true },
        }),
        this.prisma.user.findMany({
          where: {
            isActive: true,
            deletedAt: null,
            ...(scope.kind === "GLOBAL"
              ? {}
              : { memberships: { some: { subsystemId: { in: ids } } } }),
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            memberships: {
              where:
                scope.kind === "GLOBAL" ? {} : { subsystemId: { in: ids } },
              select: {
                subsystemId: true,
                accessLevel: true,
                subsystem: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.task.findMany({
          where: { ...placement, deletedAt: null, isArchived: false },
          include: { subsystem: { select: { name: true } } },
        }),
        this.prisma.decisionRecord.findMany({
          where: {
            AND: [this.core.decisionWhere(actor), placement],
            status: { in: ["PROPOSED", "ACCEPTED"] },
          },
          select: {
            id: true,
            title: true,
            status: true,
            context: true,
            decision: true,
            rationale: true,
            createdAt: true,
            subsystem: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        this.prisma.calendarEvent.findMany({
          where: { ...placement, startsAt: { gte: new Date() } },
          select: {
            title: true,
            startsAt: true,
            subsystem: { select: { name: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 10,
        }),
      ]);
    const now = new Date();
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const overdue = tasks.filter(
      (t) => t.status !== "COMPLETED" && t.deadline < now,
    ).length;
    const contacts = users.filter(
      (u) =>
        u.role === "OWNER" ||
        u.memberships.some((m) => m.accessLevel === "ADMIN"),
    );
    const handoff: HandoffPackage = {
      metadata: {
        generatedAt: now,
        generatedBy: identity.name,
        clubName: "ANTARA CubeSat Team",
        semester: `${now.getMonth() >= 7 ? "Fall" : now.getMonth() >= 1 ? "Spring" : "Winter"} ${now.getFullYear()}`,
        historicalAnalytics: "UNAVAILABLE_PENDING_SCOPE_REVIEW",
      },
      clubHealth: {
        productivityIndex: tasks.length
          ? Math.min(
              99,
              Math.round(
                (completed / tasks.length) * 100 +
                  (tasks.length - completed) * 1.5,
              ),
            )
          : 0,
        subsystemVelocity: tasks.length
          ? Math.min(
              99,
              Math.round(
                (completed / tasks.length) * 100 +
                  (tasks.length - completed) * 1.5,
              ),
            )
          : 0,
        overdueRate: tasks.length ? (overdue / tasks.length) * 100 : 0,
        clubHealthScore: tasks.length
          ? Math.min(99, Math.round(75 + (completed / tasks.length) * 20))
          : 0,
        memberCount: users.length,
        activeTaskCount: tasks.length - completed,
      },
      subsystemStatus: subsystems.map((subsystem) => {
        const relevant = tasks.filter((t) => t.subsystemId === subsystem.id);
        const members = users.filter((u) =>
          u.memberships.some((m) => m.subsystemId === subsystem.id),
        );
        const done = relevant.filter((t) => t.status === "COMPLETED").length;
        const late = relevant.filter(
          (t) => t.status !== "COMPLETED" && t.deadline < now,
        ).length;
        return {
          name: subsystem.name,
          slug: subsystem.slug,
          color: subsystem.color,
          memberCount: members.length,
          activeTasks: relevant.length - done,
          completedTasks: done,
          overdueTasks: late,
          blockedTasks: relevant.filter((t) => t.status === "BLOCKED").length,
          velocity: relevant.length
            ? Math.min(
                99,
                Math.round(55 + done * 6 + (relevant.length - done) * 2),
              )
            : 0,
          riskScore: relevant.length
            ? Math.min(
                99,
                Math.round(
                  20 +
                    late * 12 +
                    relevant.filter((t) => t.status === "BLOCKED").length * 10 +
                    (relevant.length - done) * 3 +
                    relevant.reduce(
                      (sum, t) => sum + Number(t.estimatedHours ?? 0),
                      0,
                    ) /
                      2,
                ),
              )
            : 0,
          upcomingDeadlines: relevant
            .filter((t) => t.status !== "COMPLETED" && t.deadline >= now)
            .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
            .slice(0, 5)
            .map((t) => ({
              id: t.id,
              title: t.title,
              deadline: t.deadline,
              priority: t.priority,
            })),
          keyContacts: members
            .filter(
              (u) =>
                u.role === "OWNER" ||
                u.memberships.some(
                  (m) =>
                    m.subsystemId === subsystem.id && m.accessLevel === "ADMIN",
                ),
            )
            .map((u) => ({
              name: u.name,
              email: u.email,
              role: u.role,
              subsystem: subsystem.name,
            })),
        };
      }),
      // Historical prose/snapshots lack provenance; never import global history into a scoped export.
      riskRegister: [],
      openDecisions: decisions.map((d) => ({
        ...d,
        subsystem: d.subsystem?.name ?? "Global",
      })),
      milestoneTracker: events.map((e) => ({
        name: e.title,
        date: e.startsAt,
        type: "meeting",
        subsystem: e.subsystem?.name ?? "Unscoped",
        requiredTasks: [],
        status: "pending",
      })),
      keyContacts: contacts.map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        subsystem:
          u.memberships.map((m) => m.subsystem.name).join(", ") || "Global",
      })),
    };
    for (const task of tasks
      .filter((t) => t.priority === "CRITICAL" && t.status !== "COMPLETED")
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 5)) {
      handoff.milestoneTracker.push({
        name: `Critical: ${task.title}`,
        date: task.deadline,
        type: "deadline",
        subsystem: task.subsystem.name,
        requiredTasks: [task.id],
        status: "pending",
      });
    }
    handoff.milestoneTracker.sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
    await this.auditService.log({
      action: "HANDOFF_PACKAGE_GENERATED",
      entityType: "Report",
      entityId: `handoff-${now.getTime()}`,
      actorId,
      payload: { subsystemCount: subsystems.length, taskCount: tasks.length },
    });
    return handoff;
  }

  async generateMarkdownHandoff(
    actorId: string,
    subsystemId?: string,
  ): Promise<string> {
    return this.renderMarkdownHandoff(
      await this.generateHandoffPackage(actorId, subsystemId),
    );
  }

  private renderMarkdownHandoff(handoff: HandoffPackage): string {
    let md = `# ${handoff.metadata.clubName} - Handoff Package\n\n`;
    md += `**Generated:** ${handoff.metadata.generatedAt.toLocaleString()}\n`;
    md += `**Generated By:** ${handoff.metadata.generatedBy}\n`;
    md += `**Semester:** ${handoff.metadata.semester}\n\n`;

    md += `Historical analytics unavailable pending scope review. Metrics below use only current authorized records.\n\n`;
    md += `## 📊 Club Health Overview\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Productivity Index | ${handoff.clubHealth.productivityIndex} |\n`;
    md += `| Subsystem Velocity | ${handoff.clubHealth.subsystemVelocity}% |\n`;
    md += `| Overdue Rate | ${handoff.clubHealth.overdueRate}% |\n`;
    md += `| Club Health Score | ${handoff.clubHealth.clubHealthScore} |\n`;
    md += `| Active Members | ${handoff.clubHealth.memberCount} |\n`;
    md += `| Active Tasks | ${handoff.clubHealth.activeTaskCount} |\n\n`;

    md += `## 🛰️ Subsystem Status\n\n`;
    for (const sub of handoff.subsystemStatus) {
      md += `### ${sub.name} (${sub.slug})\n`;
      md += `**Color:** ${sub.color} | **Members:** ${sub.memberCount} | **Velocity:** ${sub.velocity}% | **Risk:** ${sub.riskScore}\n\n`;
      md += `| Metric | Count |\n|--------|-------|\n`;
      md += `| Active Tasks | ${sub.activeTasks} |\n`;
      md += `| Completed | ${sub.completedTasks} |\n`;
      md += `| Overdue | ${sub.overdueTasks} |\n`;
      md += `| Blocked | ${sub.blockedTasks} |\n\n`;

      if (sub.upcomingDeadlines.length > 0) {
        md += `**Upcoming Deadlines:**\n`;
        for (const d of sub.upcomingDeadlines) {
          md += `- **${d.title}** (${d.priority}) - Due: ${new Date(d.deadline).toLocaleDateString()}\n`;
        }
        md += "\n";
      }

      if (sub.keyContacts.length > 0) {
        md += `**Key Contacts:**\n`;
        for (const c of sub.keyContacts) {
          md += `- ${c.name} (${c.role}) - ${c.email}\n`;
        }
        md += "\n";
      }
    }

    md += `## ⚠️ Risk Register\n\n`;
    for (const risk of handoff.riskRegister) {
      md += `### ${risk.title} (${risk.severity} - Score: ${risk.riskScore})\n`;
      md += `**Subsystem:** ${risk.subsystem}\n\n`;
      md += `${risk.summary}\n\n`;
      md += `**Recommendation:** ${risk.recommendation}\n\n`;
    }

    md += `## 📋 Open Decisions\n\n`;
    for (const decision of handoff.openDecisions) {
      md += `### ${decision.title} (${decision.status})\n`;
      md += `**Subsystem:** ${decision.subsystem}\n\n`;
      md += `**Context:** ${decision.context}\n\n`;
      md += `**Decision:** ${decision.decision}\n\n`;
      md += `**Rationale:** ${decision.rationale}\n\n`;
      md += `---\n\n`;
    }

    md += `## 🎯 Milestone Tracker\n\n`;
    for (const m of handoff.milestoneTracker) {
      md += `- **${m.name}** (${m.type}) - ${m.subsystem} - ${m.date.toLocaleDateString()} - ${m.status}\n`;
      if (m.requiredTasks.length > 0) {
        md += `  Tasks: ${m.requiredTasks.join(", ")}\n`;
      }
    }
    md += "\n";

    md += `## 👥 Key Contacts\n\n`;
    for (const c of handoff.keyContacts) {
      md += `- **${c.name}** (${c.role}, ${c.subsystem}) - ${c.email}\n`;
    }

    md += `\n---\n*Generated by ANTARA ERP on ${new Date().toLocaleString()}*`;
    return md;
  }
}
