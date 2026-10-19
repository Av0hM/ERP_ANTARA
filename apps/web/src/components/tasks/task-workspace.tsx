"use client";
import { OperationFeedback } from "@/components/ui/operation-feedback";
import { useUrlChoice } from "@/hooks/use-url-choice";
import { useShell } from "@/components/layout/app-shell";

import { useEffect, useMemo, useState } from "react";
import { Search, Signal, TimerReset, Users } from "lucide-react";
import { TaskCard, TaskPriority, TaskStatus } from "@antara/contracts";

import { useActorProfile } from "@/hooks/use-actor-profile";
import { canManageOperations } from "@/lib/permissions";
import { useTaskControl } from "@/hooks/use-task-control";
import { useSubsystemCatalog } from "@/hooks/use-operations";
import { TaskRecord } from "@/lib/task-types";

import { CollaborationSidebar } from "./collaboration-sidebar";
import { CreateTaskDialog } from "./create-task-dialog";
import { TaskDetailPanel } from "./task-detail-panel";
import { TaskBoard } from "./task-board";

const priorities = [
  "ALL",
  TaskPriority.LOW,
  TaskPriority.MEDIUM,
  TaskPriority.HIGH,
  TaskPriority.CRITICAL,
] as const;
type TaskWorkspaceProps = {
  tasks: TaskRecord[];
};

export function TaskWorkspace({ tasks }: TaskWorkspaceProps) {
  const { data: subsystemData = [] } = useSubsystemCatalog();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useUrlChoice("priority", priorities, "ALL");
  const [subsystem, setSubsystem] = useUrlChoice(
    "subsystem",
    ["ALL", ...subsystemData.map((item) => item.id)],
    "ALL",
  );
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>(
    tasks[0]?.id,
  );
  const control = useTaskControl(tasks);
  const actor = useActorProfile();
  const shell = useShell();

  useEffect(() => {
    if (!selectedTaskId && control.tasks[0]) {
      setSelectedTaskId(control.tasks[0].id);
    }
  }, [control.tasks, selectedTaskId]);

  const filteredTasks = useMemo(() => {
    return control.tasks.filter((task) => {
      const matchesQuery =
        query.length === 0 ||
        task.title.toLowerCase().includes(query.toLowerCase()) ||
        task.description.toLowerCase().includes(query.toLowerCase()) ||
        task.tags.some((tag) =>
          tag.toLowerCase().includes(query.toLowerCase()),
        );

      const matchesPriority = priority === "ALL" || task.priority === priority;
      const matchesSubsystem =
        subsystem === "ALL" || task.subsystemId === subsystem;

      return matchesQuery && matchesPriority && matchesSubsystem;
    });
  }, [control.tasks, priority, query, subsystem]);

  const selectedTask =
    control.tasks.find((task) => task.id === selectedTaskId) ??
    filteredTasks[0];

  const metrics = [
    {
      label: "Visible Tasks",
      value: String(filteredTasks.length),
      icon: Signal,
    },
    {
      label: "In Progress",
      value: String(control.summary.inProgress),
      icon: TimerReset,
    },
    {
      label: "Collaborators",
      value: String(control.summary.collaborators),
      icon: Users,
    },
  ];

  if (control.error)
    return (
      <OperationFeedback
        state="error"
        error={control.error}
        onRetry={control.retry}
        page="Tasks"
      />
    );
  if (control.isLoading)
    return (
      <OperationFeedback
        state="loading"
        message="Loading tasks in your current access scope…"
      />
    );

  return (
    <div className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-saffron">
              Mission Task Control
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Search, filter, and rebalance subsystem work
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-muted">
              This workspace now supports live-ready task queries, optimistic
              status mutations, comments, and collaboration presence rails.
            </p>
            <div className="mt-5">
              {shell.data.permissions.manageOperations && (
                <CreateTaskDialog
                  onCreate={control.createTask}
                  isCreating={control.isCreatingTask}
                />
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {metrics.map(({ label, value, icon: Icon }) => (
              <div key={label} className="card-dark rounded-[1.25rem] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.18em] text-muted">
                    {label}
                  </span>
                  <Icon className="size-4 text-saffron" />
                </div>
                <p className="mt-3 text-3xl font-semibold">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 xl:grid-cols-[1.8fr_1fr_1fr]">
          <label className="flex items-center gap-3 rounded-xl border border-steel/30 bg-white/5 px-4 py-3">
            <Search className="size-4 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tasks, dependencies, tags..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>

          <select
            aria-label="Task priority filter"
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as (typeof priorities)[number])
            }
            className="input-field"
          >
            {priorities.map((option) => (
              <option
                key={option}
                value={option}
                className="bg-panel text-text"
              >
                {option}
              </option>
            ))}
          </select>

          <select
            aria-label="Task subsystem filter"
            value={subsystem}
            onChange={(event) => setSubsystem(event.target.value)}
            className="input-field"
          >
            <option value="ALL">All readable subsystems</option>
            {subsystemData.map((item) => (
              <option
                key={item.id}
                value={item.id}
                className="bg-panel text-text"
              >
                {item.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      {control.tasks.length === 0 ? (
        <section className="section-dark grid-texture-dark rounded-[2rem] border border-dashed border-steel/30 p-6 text-sm text-muted">
          No tasks are currently available in your access scope. Tasks will
          appear here when your team adds work.
        </section>
      ) : null}

      <section className="grid gap-6 2xl:grid-cols-[1.6fr_0.9fr_0.75fr]">
        <TaskBoard
          tasks={filteredTasks}
          selectedTaskId={selectedTask?.id}
          onSelectTask={(task) => setSelectedTaskId(task.id)}
        />
        <TaskDetailPanel
          task={selectedTask}
          typing={control.typing}
          onStatusChange={control.updateStatus}
          onCommentSubmit={control.addComment}
          onTyping={control.emitTyping}
          isMutating={control.isUpdatingStatus || control.isAddingComment}
        />
        <CollaborationSidebar
          presence={control.presence}
          activity={control.activity}
        />
      </section>
    </div>
  );
}
