export enum AppRole {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export enum Role {
  OWNER = "OWNER",
  ADMIN = "ADMIN",
  MEMBER = "MEMBER",
}

export enum TaskStatus {
  BACKLOG = "BACKLOG",
  TODO = "TODO",
  IN_PROGRESS = "IN_PROGRESS",
  BLOCKED = "BLOCKED",
  REVIEW = "REVIEW",
  COMPLETED = "COMPLETED",
  OVERDUE = "OVERDUE",
}

export enum TaskPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

export enum WorklogSource {
  TIMER = "TIMER",
  MANUAL = "MANUAL",
}

export enum NotificationType {
  TASK_ASSIGNED = "TASK_ASSIGNED",
  COMMENT_ADDED = "COMMENT_ADDED",
  DEADLINE_WARNING = "DEADLINE_WARNING",
  OVERDUE_RISK = "OVERDUE_RISK",
  SYSTEM = "SYSTEM",
}

export enum InsightSeverity {
  INFO = "INFO",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
}

export enum InvitationStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  EXPIRED = "EXPIRED",
  REVOKED = "REVOKED",
}

