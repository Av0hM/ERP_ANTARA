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
  ) {}

  async generateHandoffPackage(actorId: string): Promise<HandoffPackage> {
    const now = new Date();
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, email: true, role: true },
    });

    const [
      analytics,
      aiBundle,
      subsystems,
      users,
      decisions,
      calendarEvents,
    ] = await Promise.all([
      this.prisma.analyticsSnapshot.findFirst({
        where: { scope: "GLOBAL" },
        orderBy: { createdAt: "desc" },
      }),
      this.aiService.getBundle(),
      this.prisma.subsystem.findMany({
        include: { users: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, name: true, email: true, role: true, subsystemId: true, subsystem: { select: { name: true } } },
      }),
      this.prisma.decisionRecord.findMany({
        where: { status: { in: ["PROPOSED", "ACCEPTED"] } },
        include: { subsystem: { select: { name: true } }, author: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.calendarEvent.findMany({
        where: { startsAt: { gte: new Date() } },
        include: { subsystem: { select: { name: true } } },
        orderBy: { startsAt: "asc" },
        take: 10,
      }),
    ]);

    const allTasks = await this.prisma.task.findMany({
      where: { deletedAt: null, isArchived: false },
      include: { subsystem: true, assignedTo: { select: { name: true, email: true } } },
    });

    const semester = this.getCurrentSemester();

    const handoff: HandoffPackage = {
      metadata: {
        generatedAt: now,
        generatedBy: actor?.name ?? "Unknown",
        clubName: "ANTARA CubeSat Team",
        semester,
      },
      clubHealth: this.buildClubHealth(analytics, allTasks, users),
      subsystemStatus: this.buildSubsystemStatus(subsystems, allTasks, users),
      riskRegister: this.buildRiskRegister(aiBundle),
      openDecisions: this.buildOpenDecisions(decisions),
      milestoneTracker: this.buildMilestoneTracker(calendarEvents, allTasks),
      keyContacts: this.buildKeyContacts(users),
    };

    await this.auditService.log({
      action: "HANDOFF_PACKAGE_GENERATED",
      entityType: "Report",
      entityId: `handoff-${now.getTime()}`,
      actorId,
      payload: { subsystemCount: subsystems.length, taskCount: allTasks.length },
    });

    return handoff;
  }

  private getCurrentSemester(): string {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    if (month >= 7) return `Fall ${year}`;
    if (month >= 1) return `Spring ${year}`;
    return `Winter ${year}`;
  }

  private buildClubHealth(analytics: any, tasks: any[], users: any[]) {
    const totalTasks = tasks.length;
    const completed = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const overdue = tasks.filter((t) => t.status === TaskStatus.OVERDUE || (t.deadline < new Date() && t.status !== TaskStatus.COMPLETED)).length;
    const active = tasks.filter((t) => t.status !== TaskStatus.COMPLETED).length;

    return {
      productivityIndex: analytics?.productivityIndex ?? Math.min(99, Math.round((completed / (totalTasks || 1)) * 100 + active * 1.5)),
      subsystemVelocity: analytics?.subsystemVelocity ?? Math.min(99, Math.round((completed / (totalTasks || 1)) * 100 + active * 1.5)),
      overdueRate: totalTasks > 0 ? Number(((overdue / totalTasks) * 100).toFixed(1)) : 0,
      clubHealthScore: analytics?.clubHealth ?? Math.min(99, Math.round(75 + (completed / (totalTasks || 1)) * 20)),
      memberCount: users.length,
      activeTaskCount: active,
    };
  }

  private buildSubsystemStatus(subsystems: any[], tasks: any[], users: any[]) {
    return subsystems.map((subsystem) => {
      const relevantTasks = tasks.filter((t) => t.subsystemId === subsystem.id);
      const subsystemUsers = users.filter((u) => u.subsystemId === subsystem.id);
      const completed = relevantTasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
      const overdue = relevantTasks.filter((t) => t.status === TaskStatus.OVERDUE || (t.deadline < new Date() && t.status !== TaskStatus.COMPLETED)).length;
      const blocked = relevantTasks.filter((t) => t.status === TaskStatus.BLOCKED).length;
      const active = relevantTasks.filter((t) => t.status !== TaskStatus.COMPLETED).length;
      const totalHours = relevantTasks.reduce((sum, t) => sum + Number(t.estimatedHours ?? 0), 0);

      const keyContacts = subsystemUsers
        .filter((u) => u.role === "ADMIN" || u.role === "OWNER")
        .map((u) => ({
          name: u.name,
          email: u.email,
          role: u.role,
          subsystem: subsystem.name,
        }));

      const upcomingDeadlines = relevantTasks
        .filter((t) => t.status !== TaskStatus.COMPLETED && t.deadline > new Date())
        .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
        .slice(0, 5)
        .map((t) => ({
          id: t.id,
          title: t.title,
          deadline: t.deadline,
          priority: t.priority,
        }));

      return {
        name: subsystem.name,
        slug: subsystem.slug,
        color: subsystem.color,
        memberCount: subsystemUsers.length,
        activeTasks: active,
        completedTasks: completed,
        overdueTasks: overdue,
        blockedTasks: blocked,
        velocity: Math.min(99, Math.round(55 + completed * 6 + active * 2)),
        riskScore: Math.min(99, Math.round(20 + overdue * 12 + blocked * 10 + active * 3 + totalHours / 2)),
        upcomingDeadlines,
        keyContacts,
      };
    });
  }

  private buildRiskRegister(aiBundle: any) {
    return (aiBundle?.insights ?? []).map((insight: any) => ({
      id: insight.id,
      title: insight.title,
      severity: insight.severity,
      subsystem: insight.subsystem,
      summary: insight.summary,
      recommendation: insight.recommendation,
      riskScore: insight.riskScore,
    }));
  }

  private buildOpenDecisions(decisions: any[]) {
    return decisions.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      subsystem: d.subsystem?.name ?? "General",
      context: d.context,
      decision: d.decision,
      rationale: d.rationale,
      createdAt: d.createdAt,
    }));
  }

private buildMilestoneTracker(events: any[], tasks: any[]) {
    const milestones: Array<{
      name: string;
      date: Date;
      type: string;
      subsystem: string;
      requiredTasks: string[];
      status: "pending" | "in-progress" | "completed";
    }> = events.map((e) => ({
      name: e.title,
      date: new Date(e.startsAt),
      type: "meeting",
      subsystem: e.subsystem?.name ?? "General",
      requiredTasks: [],
      status: "pending" as const,
    }));

    // Add task-based milestones
    const criticalTasks = tasks
      .filter((t) => t.priority === "CRITICAL" && t.status !== TaskStatus.COMPLETED)
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime())
      .slice(0, 5);

    for (const task of criticalTasks) {
      milestones.push({
        name: `Critical: ${task.title}`,
        date: task.deadline,
        type: "deadline",
        subsystem: task.subsystem?.name ?? "Unknown",
        requiredTasks: [task.id],
        status: "pending" as const,
      });
    }

    return milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private buildKeyContacts(users: any[]) {
    return users
      .filter((u) => u.role === "OWNER" || u.role === "ADMIN")
      .map((u) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        subsystem: u.subsystem?.name ?? "General",
      }));
  }

  async generateMarkdownHandoff(actorId: string): Promise<string> {
    const handoff = await this.generateHandoffPackage(actorId);
    return this.renderMarkdownHandoff(handoff);
  }

  private renderMarkdownHandoff(handoff: HandoffPackage): string {
    let md = `# ${handoff.metadata.clubName} - Handoff Package\n\n`;
    md += `**Generated:** ${handoff.metadata.generatedAt.toLocaleString()}\n`;
    md += `**Generated By:** ${handoff.metadata.generatedBy}\n`;
    md += `**Semester:** ${handoff.metadata.semester}\n\n`;

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