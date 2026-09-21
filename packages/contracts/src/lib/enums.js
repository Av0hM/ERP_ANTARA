"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InvitationStatus = exports.InsightSeverity = exports.NotificationType = exports.WorklogSource = exports.TaskPriority = exports.TaskStatus = exports.Role = exports.AppRole = void 0;
var AppRole;
(function (AppRole) {
    AppRole["OWNER"] = "OWNER";
    AppRole["ADMIN"] = "ADMIN";
    AppRole["MEMBER"] = "MEMBER";
})(AppRole || (exports.AppRole = AppRole = {}));
var Role;
(function (Role) {
    Role["OWNER"] = "OWNER";
    Role["ADMIN"] = "ADMIN";
    Role["MEMBER"] = "MEMBER";
})(Role || (exports.Role = Role = {}));
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["BACKLOG"] = "BACKLOG";
    TaskStatus["TODO"] = "TODO";
    TaskStatus["IN_PROGRESS"] = "IN_PROGRESS";
    TaskStatus["BLOCKED"] = "BLOCKED";
    TaskStatus["REVIEW"] = "REVIEW";
    TaskStatus["COMPLETED"] = "COMPLETED";
    TaskStatus["OVERDUE"] = "OVERDUE";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["LOW"] = "LOW";
    TaskPriority["MEDIUM"] = "MEDIUM";
    TaskPriority["HIGH"] = "HIGH";
    TaskPriority["CRITICAL"] = "CRITICAL";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
var WorklogSource;
(function (WorklogSource) {
    WorklogSource["TIMER"] = "TIMER";
    WorklogSource["MANUAL"] = "MANUAL";
})(WorklogSource || (exports.WorklogSource = WorklogSource = {}));
var NotificationType;
(function (NotificationType) {
    NotificationType["TASK_ASSIGNED"] = "TASK_ASSIGNED";
    NotificationType["COMMENT_ADDED"] = "COMMENT_ADDED";
    NotificationType["DEADLINE_WARNING"] = "DEADLINE_WARNING";
    NotificationType["OVERDUE_RISK"] = "OVERDUE_RISK";
    NotificationType["SYSTEM"] = "SYSTEM";
})(NotificationType || (exports.NotificationType = NotificationType = {}));
var InsightSeverity;
(function (InsightSeverity) {
    InsightSeverity["INFO"] = "INFO";
    InsightSeverity["WARNING"] = "WARNING";
    InsightSeverity["CRITICAL"] = "CRITICAL";
})(InsightSeverity || (exports.InsightSeverity = InsightSeverity = {}));
var InvitationStatus;
(function (InvitationStatus) {
    InvitationStatus["PENDING"] = "PENDING";
    InvitationStatus["ACCEPTED"] = "ACCEPTED";
    InvitationStatus["EXPIRED"] = "EXPIRED";
    InvitationStatus["REVOKED"] = "REVOKED";
})(InvitationStatus || (exports.InvitationStatus = InvitationStatus = {}));
