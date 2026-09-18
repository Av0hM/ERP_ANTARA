"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InsightCard } from "@antara/contracts";

import { useToast } from "@/components/ui/toast";
import { useActorProfile } from "@/hooks/use-actor-profile";
import {
  createAttachment,
  createCalendarEvent,
  createWorklog,
  fetchAiBundle,
  fetchAttachments,
  fetchAnalyticsBundle,
  fetchCalendarEvents,
  fetchDashboardBundle,
  fetchMembers,
  fetchNotifications,
  fetchSubsystems,
  fetchWorklogSummary,
  fetchWorklogs,
  summarizeTechnicalText,
  updateTaskAssignee,
  deleteNotification,
  updateNotification,
} from "@/lib/operations-api";
import { AttachmentRecord, CalendarEventRecord, NotificationRecord, SubsystemRecord, WorklogRecord } from "@/lib/operations-types";
import { fetchTasks } from "@/lib/task-api";

export function useDashboardData() {
  const actor = useActorProfile();
  return useQuery({
    queryKey: ["dashboard-bundle", actor?.accessToken],
    queryFn: () => fetchDashboardBundle(actor!.accessToken),
    enabled: !!actor,
  });
}

export function useAnalyticsData() {
  const actor = useActorProfile();
  const analytics = useQuery({
    queryKey: ["analytics-bundle", actor?.accessToken],
    queryFn: async () => {
      const [analyticsBundle, aiBundle] = await Promise.all([
        fetchAnalyticsBundle(actor!.accessToken),
        fetchAiBundle(actor!.accessToken),
      ]);

      return { ...analyticsBundle, ...aiBundle };
    },
    enabled: !!actor,
  });

  return {
    overview: analytics.data?.overview,
    velocity: analytics.data?.velocity ?? [],
    heatmap: analytics.data?.heatmap ?? [],
    subsystems: analytics.data?.subsystems ?? [],
    insights:
      analytics.data?.insights.map((insight) => ({
        ...insight,
        severity: insight.severity as InsightCard["severity"],
      })) ?? [],
    reminders: analytics.data?.reminders ?? [],
    schedule: analytics.data?.schedule ?? [],
    workload: analytics.data?.workload ?? [],
    isLoading: analytics.isLoading,
  };
}

export function useNotificationCenter() {
  const actor = useActorProfile();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const notifications = useQuery({
    queryKey: ["notifications", actor?.accessToken],
    queryFn: () => fetchNotifications(actor!.accessToken),
    enabled: !!actor,
  });

  const markRead = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) => updateNotification(id, isRead, actor!.accessToken),
    onMutate: async ({ id, isRead }) => {
      await queryClient.cancelQueries({ queryKey: ["notifications", actor?.accessToken] });
      const previous = queryClient.getQueryData<NotificationRecord[]>(["notifications", actor?.accessToken]) ?? [];
      queryClient.setQueryData<NotificationRecord[]>(["notifications", actor?.accessToken], (current = []) =>
        current.map((item) => (item.id === id ? { ...item, isRead } : item)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notifications", actor?.accessToken], context.previous);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteNotification(id, actor!.accessToken),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["notifications", actor?.accessToken] });
      const previous = queryClient.getQueryData<NotificationRecord[]>(["notifications", actor?.accessToken]) ?? [];
      queryClient.setQueryData<NotificationRecord[]>(["notifications", actor?.accessToken], (current = []) =>
        current.filter((item) => item.id !== id),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["notifications", actor?.accessToken], context.previous);
      }
    },
  });

  return {
    notifications: notifications.data ?? [],
    markRead: (id: string, isRead: boolean) => markRead.mutate({ id, isRead }),
    deleteNotification: (id: string) => deleteMutation.mutate(id),
    markAllAsRead: () => {
      const unread = (notifications.data ?? []).filter((item) => !item.isRead);
      if (!unread.length) {
        return;
      }
      void Promise.all(unread.map((item) => markRead.mutateAsync({ id: item.id, isRead: true }))).then(() => {
        addToast("Notifications marked as read", "success");
      });
    },
  };
}

export function useCalendarData() {
  const actor = useActorProfile();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const events = useQuery({
    queryKey: ["calendar-events", actor?.accessToken],
    queryFn: () => fetchCalendarEvents(actor!.accessToken),
    enabled: !!actor,
  });

  const createEvent = useMutation({
    mutationFn: (input: { title: string; description?: string; startsAt: string; endsAt: string; subsystemId?: string }) =>
      createCalendarEvent(input, actor!.accessToken),
    onSuccess: (created) => {
      queryClient.setQueryData<CalendarEventRecord[]>(["calendar-events", actor?.accessToken], (current = []) => [...current, created]);
      addToast("Event created", "success");
    },
    onError: () => {
      addToast("Something went wrong. Please try again.", "error");
    },
  });

  return {
    events: events.data ?? [],
    createEvent: createEvent.mutate,
    isCreating: createEvent.isPending,
  };
}

export function useWorklogData() {
  const actor = useActorProfile();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const logs = useQuery({
    queryKey: ["worklogs", actor?.accessToken],
    queryFn: () => fetchWorklogs(actor!.accessToken),
    enabled: !!actor,
  });
  const summary = useQuery({
    queryKey: ["worklog-summary", actor?.accessToken],
    queryFn: () => fetchWorklogSummary(actor!.accessToken),
    enabled: !!actor,
  });

  const create = useMutation({
    mutationFn: (input: {
      userId: string;
      taskId: string;
      startedAt: string;
      endedAt: string;
      durationMin: number;
      notes?: string;
    }) => createWorklog(input, actor!.accessToken),
    onSuccess: (created) => {
      queryClient.setQueryData<WorklogRecord[]>(["worklogs", actor?.accessToken], (current = []) => [
        {
          id: String((created as { id?: string }).id ?? `worklog-${Date.now()}`),
          startedAt: (created as { startedAt?: string }).startedAt ?? new Date().toISOString(),
          endedAt: (created as { endedAt?: string }).endedAt,
          durationMin: Number((created as { durationMin?: number }).durationMin ?? 0),
          notes: (created as { notes?: string }).notes,
          task: { title: "Manual worklog entry" },
          user: { name: actor!.name },
        },
        ...current,
      ]);
      addToast("Worklog submitted", "success");
    },
    onError: () => {
      addToast("Something went wrong. Please try again.", "error");
    },
  });

  return {
    logs: logs.data ?? [],
    summary: summary.data,
    createWorklog: create.mutateAsync,
    isCreating: create.isPending,
  };
}

export function useAiSummary() {
  const actor = useActorProfile();
  const summary = useMutation({
    mutationFn: (input: { text: string; context?: string }) => summarizeTechnicalText(input, actor!.accessToken),
  });

  return {
    summarize: summary.mutateAsync,
    isSummarizing: summary.isPending,
  };
}

export function useAttachmentVault() {
  const actor = useActorProfile();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const attachments = useQuery({
    queryKey: ["attachments", actor?.accessToken],
    queryFn: () => fetchAttachments(actor!.accessToken),
    enabled: !!actor,
  });

  const create = useMutation({
    mutationFn: (input: {
      name: string;
      mimeType: string;
      sizeBytes: number;
      taskId?: string;
      tags?: string[];
      contentBase64?: string;
    }) =>
      createAttachment(
        {
          ...input,
          uploadedById: actor!.id,
        },
        actor!.accessToken,
      ),
    onSuccess: (created) => {
      queryClient.setQueryData<AttachmentRecord[]>(["attachments", actor?.accessToken], (current = []) => [
        created,
        ...current,
      ]);
      addToast("File uploaded", "success");
    },
    onError: () => {
      addToast("Something went wrong. Please try again.", "error");
    },
  });

  return {
    attachments: attachments.data ?? [],
    createAttachment: create.mutate,
    isCreating: create.isPending,
  };
}

export function useSubsystemCatalog() {
  const actor = useActorProfile();
  return useQuery({
    queryKey: ["subsystems", actor?.accessToken],
    queryFn: () => fetchSubsystems(actor!.accessToken),
    enabled: !!actor,
  });
}

export function useTaskCatalog() {
  const actor = useActorProfile();
  return useQuery({
    queryKey: ["tasks-catalog", actor?.accessToken],
    queryFn: () => fetchTasks(actor!.accessToken),
    enabled: !!actor,
  });
}

export function useMemberCatalog() {
  const actor = useActorProfile();
  return useQuery({
    queryKey: ["members", actor?.accessToken],
    queryFn: () => fetchMembers(actor!.accessToken),
    enabled: !!actor,
  });
}

export function useReassignTask() {
  const actor = useActorProfile();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  return useMutation({
    mutationFn: (input: { taskId: string; assignedToId: string | null }) =>
      updateTaskAssignee(input.taskId, input.assignedToId, actor!.accessToken),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks", actor?.accessToken] });
      addToast("Task reassigned", "success");
    },
    onError: () => {
      addToast("Failed to reassign task", "error");
    },
  });
}