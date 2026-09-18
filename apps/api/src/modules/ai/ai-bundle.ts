export type AiBundle = {
  insights: Array<{
    id: string;
    title: string;
    summary: string;
    severity: string;
    recommendation?: string;
    riskScore?: number;
    subsystem?: string;
  }>;
  reminders: Array<{ id: string; message: string; priority: string }>;
  schedule: Array<{ id: string; title: string; reason: string }>;
  workload: Array<{ id: string; from: string; to: string; reason: string }>;
};
