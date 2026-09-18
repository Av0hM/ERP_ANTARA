import { AppRole, TaskPriority, TaskStatus } from "./enums";
import { SubsystemName } from "./subsystems";

export interface TaskCard {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  subsystem: SubsystemName;
  assigneeName: string;
  assigneeAvatar?: string;
  estimatedHours: number;
  dependencyCount: number;
  tags: string[];
  deadline: string;
}

export interface DashboardSummary {
  role: AppRole;
  greeting: string;
  tasksTotal: number;
  overdueTasks: number;
  workloadBalanceScore: number;
  clubHealthScore: number;
}

