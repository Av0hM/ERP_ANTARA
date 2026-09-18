"use client";

import { useState } from "react";
import { MessageSquare, RadioTower, Send, Workflow } from "lucide-react";
import { TaskStatus } from "@antara/contracts";

import { Button } from "@/components/ui/button";
import { useMemberCatalog, useReassignTask } from "@/hooks/use-operations";
import { TaskRecord, TypingRecord } from "@/lib/task-types";

const statuses = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.REVIEW,
  TaskStatus.COMPLETED,
];

type TaskDetailPanelProps = {
  task?: TaskRecord;
  typing: TypingRecord | null;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onCommentSubmit: (taskId: string, content: string) => void;
  onTyping: (taskId: string) => void;
  isMutating: boolean;
};

export function TaskDetailPanel({
  task,
  typing,
  onStatusChange,
  onCommentSubmit,
  onTyping,
  isMutating,
}: TaskDetailPanelProps) {
  const [comment, setComment] = useState("");
  const { data: memberData = [] } = useMemberCatalog();
  const reassignTask = useReassignTask();

  if (!task) {
    return (
      <aside className="glass-panel rounded-[2rem] p-6">
        <p className="text-xs uppercase tracking-[0.28em] text-accent">Task Console</p>
        <h2 className="mt-3 text-2xl font-semibold">Select a task to inspect dependencies and discussion</h2>
        <p className="mt-3 text-sm text-muted">
          This rail becomes the collaboration center for status changes, blockers, comments, and future AI suggestions.
        </p>
      </aside>
    );
  }

  return (
    <aside className="glass-panel rounded-[2rem] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-accent">{task.subsystem}</p>
          <h2 className="mt-2 text-2xl font-semibold">{task.title}</h2>
          <p className="mt-3 text-sm text-muted">{task.description}</p>
        </div>
        <span className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-[0.2em] text-cobalt">
          {task.priority}
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white/5 p-4">
          <RadioTower className="size-4 text-accent" />
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted">Assignee</p>
          <select
            value={task.assignedToId ?? ""}
            onChange={(event) => reassignTask.mutate({ taskId: task.id, assignedToId: event.target.value || null })}
            className="mt-2 w-full rounded-2xl border border-line bg-panel px-3 py-2 text-sm outline-none"
          >
            <option value="">Unassigned</option>
            {memberData.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.subsystem?.name ?? member.role})
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted">{task.assigneeName}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white/5 p-4">
          <Workflow className="size-4 text-accent" />
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted">Dependencies</p>
          <p className="mt-1 font-medium">{task.dependencyCount}</p>
        </div>
        <div className="rounded-2xl border border-line bg-white/5 p-4">
          <MessageSquare className="size-4 text-accent" />
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted">Comments</p>
          <p className="mt-1 font-medium">{task.comments.length}</p>
        </div>
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted">Lifecycle Status</label>
        <select
          value={task.status}
          disabled={isMutating}
          onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
          className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm outline-none"
        >
          {statuses.map((status) => (
            <option key={status} value={status} className="bg-panel text-text">
              {status.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Discussion Feed</h3>
          {typing?.taskId === task.id ? <span className="text-xs text-accent">{typing.userName} is typing...</span> : null}
        </div>
        <div className="mt-4 max-h-72 space-y-3 overflow-auto pr-1">
          {task.comments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
              No comments yet. This is ready for subsystem discussion and review notes.
            </div>
          ) : (
            task.comments.map((entry) => (
              <article key={entry.id} className="rounded-2xl border border-line bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">{entry.authorName}</p>
                  <span className="text-xs text-muted">
                    {new Date(entry.createdAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted">{entry.content}</p>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="mt-6">
        <label className="mb-2 block text-xs uppercase tracking-[0.2em] text-muted">Add Comment</label>
        <textarea
          value={comment}
          onChange={(event) => {
            setComment(event.target.value);
            if (task) {
              onTyping(task.id);
            }
          }}
          rows={4}
          placeholder="Capture integration notes, blockers, or review feedback..."
          className="w-full rounded-2xl border border-line bg-white/5 px-4 py-3 text-sm outline-none placeholder:text-muted"
        />
        <Button
          className="mt-3 gap-2"
          onClick={() => {
            if (!comment.trim()) {
              return;
            }
            onCommentSubmit(task.id, comment.trim());
            setComment("");
          }}
        >
          <Send className="size-4" />
          Post Update
        </Button>
      </div>
    </aside>
  );
}

