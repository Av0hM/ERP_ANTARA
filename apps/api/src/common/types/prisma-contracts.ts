import { Decimal } from "@prisma/client/runtime/library";
import {
  AppRole,
  TaskStatus,
  TaskPriority,
  InsightSeverity,
  WorklogSource,
  NotificationType,
  DecisionStatus,
  InvitationStatus,
} from "@antara/contracts";

/**
 * Convert Prisma Decimal to number
 */
export function decimalToNumber(decimal: Decimal | null | undefined): number {
  if (decimal === null || decimal === undefined) {
    return 0;
  }
  return decimal.toNumber();
}

/**
 * Convert Prisma Role to AppRole
 */
export function roleToAppRole(role: "OWNER" | "ADMIN" | "MEMBER"): "OWNER" | "ADMIN" | "MEMBER" {
  return role;
}

/**
 * Convert Prisma TaskStatus to contract TaskStatus
 */
export function taskStatusToContract(status: string): "BACKLOG" | "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "OVERDUE" {
  return status as "BACKLOG" | "TODO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "COMPLETED" | "OVERDUE";
}

/**
 * Convert Prisma TaskPriority to contract TaskPriority
 */
export function taskPriorityToContract(priority: string): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  return priority as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

/**
 * Convert Prisma InsightSeverity to contract InsightSeverity
 */
export function insightSeverityToContract(severity: string): "INFO" | "WARNING" | "CRITICAL" {
  return severity as "INFO" | "WARNING" | "CRITICAL";
}

/**
 * Convert Prisma WorklogSource to contract WorklogSource
 */
export function worklogSourceToContract(source: string): "TIMER" | "MANUAL" {
  return source as "TIMER" | "MANUAL";
}

/**
 * Convert Prisma NotificationType to contract NotificationType
 */
export function notificationTypeToContract(type: string): "TASK_ASSIGNED" | "COMMENT_ADDED" | "DEADLINE_WARNING" | "OVERDUE_RISK" | "SYSTEM" {
  return type as "TASK_ASSIGNED" | "COMMENT_ADDED" | "DEADLINE_WARNING" | "OVERDUE_RISK" | "SYSTEM";
}

/**
 * Convert Prisma DecisionStatus to contract DecisionStatus
 */
export function decisionStatusToContract(status: string): "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "DEFERRED" {
  return status as "PROPOSED" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "DEFERRED";
}

/**
 * Convert Prisma InvitationStatus to contract InvitationStatus
 */
export function invitationStatusToContract(status: string): "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" {
  return status as "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
}

/**
 * Convert Prisma Decimal to number
 */
export function decimalToNumberSafe(decimal: Decimal | null | undefined): number {
  if (decimal === null || decimal === undefined) {
    return 0;
  }
  return decimal.toNumber();
}