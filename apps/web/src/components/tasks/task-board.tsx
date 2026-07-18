import { TaskStatus } from "@antara/contracts";

import { TaskRecord } from "@/lib/task-types";

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
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      {columns.map((column) => (
        <div key={column} className="glass-panel rounded-3xl p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium">{column.replaceAll("_", " ")}</h3>
            <span className="metric-chip">{tasks.filter((task) => task.status === column).length}</span>
          </div>

          <div className="space-y-3">
            {tasks
              .filter((task) => task.status === column)
              .map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task)}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    selectedTaskId === task.id
                      ? "border-accent bg-accent/10"
                      : "border-line bg-white/5 hover:border-cobalt/50 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{task.title}</p>
                      <p className="mt-1 text-sm text-muted">{task.description}</p>
                    </div>
                    <span className="rounded-full border border-line px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-accent">
                      {task.priority}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {task.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/8 px-2 py-1 text-xs text-muted">
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted">
                    <span>{task.assigneeName}</span>
                    <span>{task.deadline}</span>
                  </div>
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}


