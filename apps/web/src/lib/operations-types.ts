import { DashboardMetric, InsightCard, TrendPoint } from "@antara/contracts";

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
};

export type CalendarEventRecord = {
  id: string;
  title: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  isRecurring?: boolean;
  subsystem?: {
    name: string;
  } | null;
};

export type WorklogRecord = {
  id: string;
  startedAt: string;
  endedAt?: string;
  durationMin: number;
  notes?: string;
  task?: {
    title: string;
  };
  user?: {
    name: string;
  };
};

export type WorklogSummary = {
  totalMinutes: number;
  totalSessions: number;
  avgSessionMinutes: number;
};

export type HeatmapCell = {
  day: string;
  intensity: number;
};

export type SubsystemRecord = {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: string;
  taskCount: number;
  memberCount: number;
  eventCount: number;
  insightCount: number;
};

export type SubsystemBreakdownRecord = {
  name: string;
  velocity: number;
  risk: number;
  completion: number;
};

export type AiReminder = {
  id: string;
  message: string;
  priority: string;
};

export type AiScheduleRecommendation = {
  id: string;
  title: string;
  reason: string;
};

export type AiWorkloadSuggestion = {
  id: string;
  from: string;
  to: string;
  reason: string;
};

export type DashboardBundle = {
  metrics: DashboardMetric[];
  activity: Array<{ id: string; title: string; description: string; timestamp: string }>;
  insights: InsightCard[];
  notifications: NotificationRecord[];
  velocity: TrendPoint[];
};

export type AnalyticsBundle = {
  overview: {
    productivityIndex: number;
    subsystemVelocity: number;
    overdueRate: number;
    clubHealth: number;
  };
  velocity: TrendPoint[];
  heatmap: HeatmapCell[];
  subsystems: SubsystemBreakdownRecord[];
};

export type AiBundle = {
  insights: AiInsightRecord[];
  reminders: AiReminder[];
  schedule: AiScheduleRecommendation[];
  workload: AiWorkloadSuggestion[];
};

export type AiSummaryResponse = {
  summary: string;
  source: "openai" | "local";
};

export type AttachmentRecord = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageUrl: string;
  driveFileId?: string | null;
  tags: string[];
  createdAt: string;
  task?: {
    id: string;
    title: string;
  } | null;
  uploadedBy?: {
    id: string;
    name: string;
  } | null;
};

export type AiInsightRecord = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  recommendation?: string;
  riskScore?: number;
  subsystem?: string;
};

