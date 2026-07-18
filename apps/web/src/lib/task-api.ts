import { TaskCard, TaskStatus } from "@antara/contracts";

import { subsystemIdMap } from "./demo-context";
import { ActivityFeedRecord, CommentMutationInput, CreateTaskInput, StatusMutationInput, TaskCommentRecord, TaskRecord } from "./task-types";

type ApiTask = {
  id: string;
  title: string;
  description: string;
  priority: TaskCard["priority"];
  status: TaskCard["status"];
  deadline: string;
  estimatedHours: number | string;
  tags: string[];
  dependencyIds?: string[];
  assignedToId?: string | null;
  assignedById?: string;
  subsystemId?: string;
  assignedTo?: { id: string; name: string; avatarUrl?: string | null } | null;
  assignedBy?: { id: string; name: string } | null;
  subsystem?: { id: string; name: TaskCard["subsystem"] } | null;
  comments?: Array<{
    id: string;
    content: string;
    createdAt: string;
    author?: { name: string } | null;
  }>;
};

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000/api";

function mapTask(task: ApiTask): TaskRecord {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    subsystem: task.subsystem?.name ?? "Software",
    assigneeName: task.assignedTo?.name ?? "Unassigned",
    assigneeAvatar: task.assignedTo?.avatarUrl ?? undefined,
    estimatedHours: Number(task.estimatedHours ?? 0),
    dependencyCount: task.dependencyIds?.length ?? 0,
    tags: task.tags ?? [],
    deadline: new Date(task.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    assignedToId: task.assignedTo?.id ?? task.assignedToId ?? undefined,
    assignedById: task.assignedBy?.id ?? task.assignedById ?? undefined,
    subsystemId: task.subsystem?.id ?? task.subsystemId,
    comments: (task.comments ?? []).map(
      (comment): TaskCommentRecord => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt,
        authorName: comment.author?.name ?? "Mission Member",
      }),
    ),
  };
}

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

export async function fetchTasks(accessToken?: string): Promise<TaskRecord[]> {
  try {
    const tasks = await request<ApiTask[]>("/tasks", undefined, accessToken);
    return tasks.map(mapTask);
  } catch {
    return [];
  }
}

export async function fetchActivityFeed(accessToken?: string): Promise<ActivityFeedRecord[]> {
  try {
    return await request<ActivityFeedRecord[]>("/tasks/activity", undefined, accessToken);
  } catch {
    return [];
  }
}

export async function updateTaskStatus(
  input: StatusMutationInput,
  accessToken?: string,
): Promise<{ taskId: string; status: TaskRecord["status"] }> {
  try {
    const task = await request<ApiTask>(
      `/tasks/${input.taskId}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: input.status }),
      },
      accessToken,
    );

    return {
      taskId: task.id,
      status: task.status,
    };
  } catch {
    return { taskId: input.taskId, status: input.status };
  }
}

export async function addTaskComment(input: CommentMutationInput, accessToken?: string): Promise<TaskCommentRecord> {
  try {
    const comment = await request<{
      id: string;
      content: string;
      createdAt: string;
      author?: { name: string } | null;
    }>(
      `/tasks/${input.taskId}/comments`,
      {
        method: "POST",
        body: JSON.stringify({
          authorId: input.authorId,
          content: input.content,
        }),
      },
      accessToken,
    );

    return {
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      authorName: comment.author?.name ?? "Mission Member",
    };
  } catch (error) {
    throw error;
  }
}

export async function createTask(input: CreateTaskInput, actorId: string, accessToken?: string): Promise<TaskRecord> {
  try {
    const task = await request<ApiTask>(
      "/tasks",
      {
        method: "POST",
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          priority: input.priority,
          status: "TODO",
          subsystemId: subsystemIdMap[input.subsystem],
          assignedById: actorId,
          assignedToId: input.assignedToId,
          estimatedHours: input.estimatedHours,
          deadline: input.deadline,
          tags: input.tags,
          dependencyIds: [],
        }),
      },
      accessToken,
    );

    return mapTask(task);
  } catch (error) {
    throw error;
  }
}

export async function updateTaskAssignee(taskId: string, assignedToId: string | null, accessToken?: string) {
  return request<ApiTask>(
    `/tasks/${taskId}/assign`,
    {
      method: "PATCH",
      body: JSON.stringify({ assignedToId }),
    },
    accessToken,
  );
}
