import { DashboardMetric, InsightSeverity, TrendPoint } from "@antara/contracts";

import {
  AiBundle,
  AiReminder,
  AiScheduleRecommendation,
  AiWorkloadSuggestion,
  AiSummaryResponse,
  AttachmentRecord,
  AnalyticsBundle,
  CalendarEventRecord,
  DashboardBundle,
  DecisionListResponse,
  DecisionRecord,
  HeatmapCell,
  NotificationRecord,
  ResourceAllocationBoard,
  ResourceAllocationSuggestedMove,
  ScheduleRiskResponse,
  SubsystemBreakdownRecord,
  SubsystemRecord,
  SubsystemHealthResponse,
  WorklogRecord,
  WorklogSummary,
} from "./operations-types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchNotifications(accessToken?: string): Promise<NotificationRecord[]> {
  try {
    return await request<NotificationRecord[]>("/notifications", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function updateNotification(id: string, isRead: boolean, accessToken?: string) {
  return request(
    `/notifications/${id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isRead }),
    },
    accessToken,
  );
}

export async function deleteNotification(id: string, accessToken?: string) {
  return request(
    `/notifications/${id}`,
    {
      method: "DELETE",
    },
    accessToken,
  );
}

export async function fetchCalendarEvents(accessToken?: string): Promise<CalendarEventRecord[]> {
  try {
    return await request<CalendarEventRecord[]>("/calendar/events", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function createCalendarEvent(
  input: {
    title: string;
    description?: string;
    startsAt: string;
    endsAt: string;
    subsystemId?: string;
  },
  accessToken?: string,
) {
  try {
    return await request<CalendarEventRecord>(
      "/calendar/events",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function fetchWorklogs(accessToken?: string): Promise<WorklogRecord[]> {
  try {
    return await request<WorklogRecord[]>("/worklogs", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchWorklogSummary(accessToken?: string): Promise<WorklogSummary> {
  try {
    return await request<WorklogSummary>("/worklogs/summary", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function createWorklog(
  input: {
    userId: string;
    taskId: string;
    startedAt: string;
    endedAt: string;
    durationMin: number;
    notes?: string;
  },
  accessToken?: string,
) {
  try {
    return await request(
      "/worklogs",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function fetchAnalyticsOverview(accessToken?: string) {
  try {
    return await request<{
      productivityIndex: number;
      subsystemVelocity: number;
      overdueRate: number;
      clubHealth: number;
    }>("/analytics/overview", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchAnalyticsVelocity(accessToken?: string): Promise<TrendPoint[]> {
  try {
    return await request<TrendPoint[]>("/analytics/velocity", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function fetchAnalyticsHeatmap(accessToken?: string): Promise<HeatmapCell[]> {
  try {
    return await request<HeatmapCell[]>("/analytics/heatmap", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function fetchSubsystemBreakdown(accessToken?: string): Promise<SubsystemBreakdownRecord[]> {
  try {
    return await request<SubsystemBreakdownRecord[]>("/analytics/subsystems", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function fetchAiInsights(accessToken?: string) {
  try {
    const raw = await request<Array<{ id: string; title: string; summary: string; severity: string; recommendation?: string; subsystem?: string }>>(
      "/ai/insights",
      undefined,
      accessToken,
    );
    return raw.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.recommendation ? `${item.summary} ${item.recommendation}` : item.summary,
      severity: item.severity as InsightSeverity,
      subsystem: item.subsystem ?? "AI Orchestrator",
    }));
  } catch {
    return [];
  }
}

export async function fetchAiReminders(accessToken?: string): Promise<AiReminder[]> {
  try {
    return await request<AiReminder[]>("/ai/reminders", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function fetchAiSchedule(accessToken?: string): Promise<AiScheduleRecommendation[]> {
  try {
    return await request<AiScheduleRecommendation[]>("/ai/schedule", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function fetchAiWorkload(accessToken?: string): Promise<AiWorkloadSuggestion[]> {
  try {
    return await request<AiWorkloadSuggestion[]>("/ai/workload", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function summarizeTechnicalText(
  input: { text: string; context?: string },
  accessToken?: string,
): Promise<AiSummaryResponse> {
  try {
    return await request<AiSummaryResponse>(
      "/ai/summarize",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function fetchAttachments(accessToken?: string): Promise<AttachmentRecord[]> {
  try {
    return await request<AttachmentRecord[]>("/files/attachments", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function createAttachment(
  input: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    taskId?: string;
    uploadedById?: string;
    tags?: string[];
    contentBase64?: string;
  },
  accessToken?: string,
): Promise<AttachmentRecord> {
  try {
    return await request<AttachmentRecord>(
      "/files/attachments",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function updateTaskAssignee(taskId: string, assignedToId: string | null, accessToken?: string) {
  return request(
    `/tasks/${taskId}/assign`,
    {
      method: "PATCH",
      body: JSON.stringify({ assignedToId }),
    },
    accessToken,
  );
}

export async function fetchAnalyticsBundle(accessToken?: string): Promise<AnalyticsBundle> {
  try {
    return await request<AnalyticsBundle>("/analytics/bundle", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchAiBundle(accessToken?: string): Promise<AiBundle> {
  try {
    return await request<AiBundle>("/ai/bundle", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchSubsystems(accessToken?: string): Promise<SubsystemRecord[]> {
  try {
    return await request<SubsystemRecord[]>("/subsystems", undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchMembers(
  accessToken?: string,
): Promise<Array<{ id: string; name: string; email: string; role: string; subsystem?: { name: string } | null }>> {
  try {
    return await request<Array<{ id: string; name: string; email: string; role: string; subsystem?: { name: string } | null }>>(
      "/users/members",
      undefined,
      accessToken,
    );
  } catch {
    return [];
  }
}

export async function fetchDashboardBundle(accessToken?: string): Promise<DashboardBundle> {
  const [overview, velocity, insights, notifications] = await Promise.all([
    fetchAnalyticsOverview(accessToken),
    fetchAnalyticsVelocity(accessToken),
    fetchAiInsights(accessToken),
    fetchNotifications(accessToken),
  ]);

  const metrics: DashboardMetric[] = [
    { label: "Productivity Index", value: `${overview.productivityIndex}`, delta: "Club-wide", direction: "up" },
    { label: "Subsystem Velocity", value: `${overview.subsystemVelocity}%`, delta: "Trend improving", direction: "up" },
    { label: "Overdue Rate", value: `${overview.overdueRate}%`, delta: "Keep below 10%", direction: "down" },
    { label: "Club Health", value: `${overview.clubHealth}`, delta: "AI composite", direction: "flat" },
  ];

  const hasRealData =
    metrics.some((metric) => Number(metric.value.replace(/[^0-9.]/g, "")) > 0) ||
    velocity.length > 0 ||
    insights.length > 0 ||
    notifications.length > 0;

  return hasRealData
    ? {
        metrics,
        activity: [],
        insights,
        notifications,
        velocity,
      }
    : {
        metrics: [],
        activity: [],
        insights: [],
        notifications: [],
        velocity: [],
      };
}

export async function fetchSubsystemHealth(
  slug: string,
  accessToken?: string,
): Promise<SubsystemHealthResponse> {
  try {
    return await request<SubsystemHealthResponse>(`/subsystems/${slug}/health`, undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchScheduleRisk(
  horizonDays?: number,
  simulations?: number,
  accessToken?: string,
): Promise<ScheduleRiskResponse> {
  try {
    const params = new URLSearchParams();
    if (horizonDays) params.set("horizonDays", String(horizonDays));
    if (simulations) params.set("simulations", String(simulations));
    return await request<ScheduleRiskResponse>(`/ai/schedule-risk?${params.toString()}`, undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchDecisions(
  params?: { status?: string; subsystemId?: string; authorId?: string },
  accessToken?: string,
): Promise<DecisionListResponse> {
  try {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.subsystemId) searchParams.set("subsystemId", params.subsystemId);
    if (params?.authorId) searchParams.set("authorId", params.authorId);
    return await request<DecisionListResponse>(`/decisions?${searchParams.toString()}`, undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchDecision(
  id: string,
  accessToken?: string,
): Promise<DecisionRecord> {
  try {
    return await request<DecisionRecord>(`/decisions/${id}`, undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function createDecision(
  input: {
    title: string;
    context: string;
    decision: string;
    rationale: string;
    alternatives?: string[];
    consequences?: string;
    subsystemId?: string;
    relatedTaskIds?: string[];
  },
  accessToken?: string,
): Promise<DecisionRecord> {
  try {
    return await request<DecisionRecord>(
      "/decisions",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function updateDecision(
  id: string,
  input: {
    title?: string;
    context?: string;
    decision?: string;
    rationale?: string;
    alternatives?: string[];
    consequences?: string;
    status?: string;
    supersededById?: string;
  },
  accessToken?: string,
): Promise<DecisionRecord> {
  try {
    return await request<DecisionRecord>(
      `/decisions/${id}`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function deleteDecision(
  id: string,
  accessToken?: string,
): Promise<{ deleted: boolean }> {
  try {
    return await request<{ deleted: boolean }>(
      `/decisions/${id}`,
      {
        method: "DELETE",
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}

export async function fetchResourceAllocationBoard(
  horizonWeeks?: number,
  accessToken?: string,
): Promise<ResourceAllocationBoard> {
  try {
    const params = new URLSearchParams();
    if (horizonWeeks) params.set("horizonWeeks", String(horizonWeeks));
    return await request<ResourceAllocationBoard>(`/resources/allocation-board?${params.toString()}`, undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function fetchSuggestedMoves(
  accessToken?: string,
): Promise<ResourceAllocationSuggestedMove[]> {
  try {
    return await request<ResourceAllocationSuggestedMove[]>(`/resources/suggested-moves`, undefined, accessToken);
  } catch (error) {
    throw error;
  }
}

export async function applyResourceMove(
  taskId: string,
  assigneeId: string,
  accessToken?: string,
): Promise<any> {
  try {
    return await request<any>(
      `/resources/tasks/${taskId}/assign`,
      {
        method: "PATCH",
        body: JSON.stringify({ assigneeId }),
      },
      accessToken,
    );
  } catch (error) {
    throw error;
  }
}
