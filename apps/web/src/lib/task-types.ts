import { TaskCard, TaskStatus } from "@antara/contracts";

export type TaskCommentRecord = {
  id: string;
  content: string;
  createdAt: string;
  authorName: string;
};

export type TaskRecord = TaskCard & {
  assignedToId?: string;
  assignedById?: string;
  subsystemId?: string;
  comments: TaskCommentRecord[];
};

export type ActivityFeedRecord = {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
};

export type PresenceRecord = {
  userId: string;
  socketId: string;
  name: string;
};

export type TypingRecord = {
  taskId: string;
  userName: string;
};

export type StatusMutationInput = {
  taskId: string;
  status: TaskStatus;
};

export type CommentMutationInput = {
  taskId: string;
  authorId: string;
  content: string;
};

export type CreateTaskInput = {
  title: string;
  description: string;
  priority: TaskRecord["priority"];
  subsystem: TaskRecord["subsystem"];
  estimatedHours: number;
  deadline: string;
  tags: string[];
  assignedToId?: string;
};

