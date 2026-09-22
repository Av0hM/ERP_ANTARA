"use client";

import { useState } from "react";
import { TaskStatus } from "@antara/contracts";
import { TaskRecord } from "@/lib/task-types";

import { GripVertical, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

const columns: TaskStatus[] = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.REVIEW,
  TaskStatus.COMPLETED,
];

type TaskBoardProps = {
  tasks: TaskRecord[];
  selectedTaskId?: string;
  onSelectTask: (task: TaskRecord) => void;
};

export function TaskBoard({ tasks, selectedTaskId, onSelectTask }: TaskBoardProps) {
  const [draggedTask, setDraggedTask] = useState<TaskRecord | null>(null);

  const handleDragStart = (task: TaskRecord) => {
    setDraggedTask(task);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (column: TaskStatus) => {
    if (draggedTask && draggedTask.status !== column) {
      onSelectTask({ ...draggedTask, status: column });
      setDraggedTask(null);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {columns.map((column) => (
        <div
          key={column}
          className="card-dark rounded-[1.25rem] p-4"
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(column)}
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">{column.replaceAll("_", " ")}</h3>
            <span className="metric-chip">{tasks.filter((task) => task.status === column).length}</span>
          </div>

          <div className="space-y-3 min-h-[200px]">
            {tasks
              .filter((task) => task.status === column)
              .map((task) => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={() => handleDragStart(task)}
                  onClick={() => onSelectTask(task)}
                  className={cn(
                    "w-full rounded-xl border p-4 text-left transition cursor-pointer touch-manipulation",
                    selectedTaskId === task.id && "border-saffron bg-saffron/10 ring-2 ring-saffron/20",
                    draggedTask?.id === task.id && "opacity-50 ring-2 ring-saffron",
                    "border-steel/30 bg-white/5 hover:border-ice/50 hover:bg-white/10 active:bg-saffron/5",
                  )}
                  style={{
                    minHeight: "60px",
                    touchAction: "none",
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="rounded-full border border-steel/30 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-saffron flex-shrink-0">
                          {task.priority}
                        </span>
                        {draggedTask?.id === task.id && (
                          <GripVertical className="text-saffron/50 cursor-grabbing" size={16} />
                        )}
                      </div>
                      <p className="font-medium truncate">{task.title}</p>
                      <p className="mt-1 text-sm text-muted line-clamp-2">{task.description}</p>
                    </div>
                    <ChevronRight className="text-muted flex-shrink-0" size={16} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {task.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/8 px-2 py-1 text-xs text-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted">
                    <span className="truncate">{task.assigneeName}</span>
                    <span className="whitespace-nowrap">{task.deadline}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}