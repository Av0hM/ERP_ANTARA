"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TaskStatus } from "@antara/contracts";
import { io, Socket } from "socket.io-client";

import { subsystemIdMap } from "@/lib/demo-context";
import { addTaskComment, createTask, fetchActivityFeed, fetchTasks, updateTaskStatus } from "@/lib/task-api";
import { ActivityFeedRecord, CreateTaskInput, PresenceRecord, TaskRecord, TypingRecord } from "@/lib/task-types";
import { useActorProfile } from "./use-actor-profile";

const socketBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/api$/, "") ?? "http://localhost:4000";

export function useTaskControl(initialTasks: TaskRecord[]) {
  const queryClient = useQueryClient();
  const actor = useActorProfile();
  const [presence, setPresence] = useState<PresenceRecord[]>([]);
  const [typing, setTyping] = useState<TypingRecord | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const tasksQuery = useQuery({
    queryKey: ["tasks", actor.accessToken],
    queryFn: () => fetchTasks(actor.accessToken),
    initialData: initialTasks,
  });

  const activityQuery = useQuery<ActivityFeedRecord[]>({
    queryKey: ["task-activity", actor.accessToken],
    queryFn: () => fetchActivityFeed(actor.accessToken),
  });

  useEffect(() => {
    let socket: Socket | null = null;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    try {
      socket = io(`${socketBaseUrl}/collaboration`, {
        transports: ["websocket"],
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket?.emit("presence.join", {
          userId: actor.id,
          name: actor.name,
        });
      });

      socket.on("presence.snapshot", (snapshot: PresenceRecord[]) => {
        setPresence(snapshot);
      });

      socket.on("discussion.typing", (payload: TypingRecord) => {
        setTyping(payload);
        if (typingTimer) {
          clearTimeout(typingTimer);
        }
        typingTimer = setTimeout(() => setTyping(null), 2200);
      });

      socket.on("task.updated", (payload: { task: Partial<TaskRecord> & { id: string; status?: TaskStatus } }) => {
        queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) =>
          current.map((task) =>
            task.id === payload.task.id
              ? {
                  ...task,
                  ...(payload.task.status ? { status: payload.task.status } : {}),
                }
              : task,
          ),
        );
      });

      socket.on("task.comment.added", (payload: { taskId?: string; task?: { id: string }; id: string; content: string; createdAt: string; author?: { name: string } }) => {
        const taskId = payload.taskId ?? payload.task?.id;
        if (!taskId) {
          return;
        }

        queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) =>
          current.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  comments: [
                    ...task.comments,
                    {
                      id: payload.id,
                      content: payload.content,
                      createdAt: payload.createdAt,
                      authorName: payload.author?.name ?? "Operator",
                    },
                  ],
                }
              : task,
          ),
        );
      });
    } catch {
      return undefined;
    }

    return () => {
      if (typingTimer) {
        clearTimeout(typingTimer);
      }
      socketRef.current = null;
      socket?.disconnect();
    };
  }, [actor.id, actor.name, queryClient]);

  const statusMutation = useMutation({
    mutationFn: (input: { taskId: string; status: TaskStatus }) => updateTaskStatus(input, actor.accessToken),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", actor.accessToken] });
      const previous = queryClient.getQueryData<TaskRecord[]>(["tasks", actor.accessToken]) ?? [];
      queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) =>
        current.map((task) => (task.id === taskId ? { ...task, status } : task)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", actor.accessToken], context.previous);
      }
    },
  });

  const commentMutation = useMutation({
    mutationFn: (input: { taskId: string; authorId: string; content: string }) => addTaskComment(input, actor.accessToken),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", actor.accessToken] });
      const previous = queryClient.getQueryData<TaskRecord[]>(["tasks", actor.accessToken]) ?? [];
      const optimisticComment = {
        id: `optimistic-${Date.now()}`,
        content: variables.content,
        createdAt: new Date().toISOString(),
        authorName: actor.name,
      };

      queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) =>
        current.map((task) =>
          task.id === variables.taskId
            ? {
                ...task,
                comments: [...task.comments, optimisticComment],
              }
            : task,
        ),
      );

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", actor.accessToken], context.previous);
      }
    },
    onSuccess: (comment, variables) => {
      queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) =>
        current.map((task) =>
          task.id === variables.taskId
            ? {
                ...task,
                comments: [...task.comments.filter((entry) => !entry.id.startsWith("optimistic-")), comment],
              }
            : task,
        ),
      );
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input, actor.id, actor.accessToken),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["tasks", actor.accessToken] });
      const previous = queryClient.getQueryData<TaskRecord[]>(["tasks", actor.accessToken]) ?? [];
      const optimisticTask: TaskRecord = {
        id: `optimistic-task-${Date.now()}`,
        title: variables.title,
        description: variables.description,
        priority: variables.priority,
        status: TaskStatus.TODO,
        subsystem: variables.subsystem,
        assigneeName: variables.assignedToId ? "Assigned member" : "Unassigned",
        estimatedHours: variables.estimatedHours,
        dependencyCount: 0,
        tags: variables.tags,
        deadline: new Date(variables.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        assignedToId: variables.assignedToId,
        assignedById: actor.id,
        subsystemId: subsystemIdMap[variables.subsystem],
        comments: [],
      };

      queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) => [optimisticTask, ...current]);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks", actor.accessToken], context.previous);
      }
    },
    onSuccess: (task) => {
      queryClient.setQueryData<TaskRecord[]>(["tasks", actor.accessToken], (current = []) => [
        task,
        ...current.filter((entry) => !entry.id.startsWith("optimistic-task-")),
      ]);
      queryClient.setQueryData<ActivityFeedRecord[]>(["task-activity", actor.accessToken], (current = []) => [
        {
          id: `created-${task.id}`,
          type: "task",
          title: `New task created: ${task.title}`,
          description: `${task.subsystem} task added to the mission board.`,
          timestamp: new Date().toISOString(),
        },
        ...current,
      ]);
    },
  });

  const tasks = tasksQuery.data ?? initialTasks;
  const activity = activityQuery.data ?? [];

  const summary = useMemo(
    () => ({
      total: tasks.length,
      inProgress: tasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
      collaborators: new Set(tasks.map((task) => task.assigneeName)).size,
    }),
    [tasks],
  );

  return {
    tasks,
    activity,
    presence,
    typing,
    summary,
    updateStatus: (taskId: string, status: TaskStatus) => statusMutation.mutate({ taskId, status }),
    createTask: (input: CreateTaskInput) => createTaskMutation.mutate(input),
    addComment: (taskId: string, content: string) =>
      commentMutation.mutate({
        taskId,
        authorId: actor.id,
        content,
      }),
    emitTyping: (taskId: string) => {
      socketRef.current?.emit("discussion.typing", {
        taskId,
        userName: actor.name,
      });
    },
    isUpdatingStatus: statusMutation.isPending,
    isAddingComment: commentMutation.isPending,
    isCreatingTask: createTaskMutation.isPending,
  };
}

