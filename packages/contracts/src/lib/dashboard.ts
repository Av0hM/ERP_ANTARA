import { InsightSeverity } from "./enums.js";

export interface DashboardMetric {
  label: string;
  value: string;
  delta: string;
  direction: "up" | "down" | "flat";
}

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp: string;
}

export interface InsightCard {
  id: string;
  title: string;
  summary: string;
  severity: InsightSeverity;
  subsystem?: string;
}

