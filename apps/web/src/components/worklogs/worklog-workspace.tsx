"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useActorProfile } from "@/hooks/use-actor-profile";
import { useTaskCatalog, useWorklogData } from "@/hooks/use-operations";

export function WorklogWorkspace() {
  const actor = useActorProfile();

  if (!actor) {
    return null;
  }

  const { logs, summary, createWorklog, isCreating } = useWorklogData();
  const { data: taskData = [] } = useTaskCatalog();
  const [taskId, setTaskId] = useState("");
  const [notes, setNotes] = useState("");
  const [durationHours, setDurationHours] = useState("0");
  const [durationMinutes, setDurationMinutes] = useState("45");
  const [isRunning, setIsRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!taskId && taskData[0]) {
      setTaskId(taskData[0].id);
    }
  }, [taskData, taskId]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const timer = setInterval(() => {
      setElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning]);

  const totalMinutes = useMemo(
    () => Math.max(1, Number(durationHours || 0) * 60 + Number(durationMinutes || 0)),
    [durationHours, durationMinutes],
  );

  const formatClock = (seconds: number) => new Date(seconds * 1000).toISOString().slice(14, 19);
  const formatDuration = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`);

  const submitLog = async (durationMinutesValue: number, startedAtIso?: string) => {
    if (!taskId) {
      return;
    }

    await createWorklog(
      {
        userId: actor.id,
        taskId,
        startedAt: startedAtIso ?? new Date(Date.now() - durationMinutesValue * 60 * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        durationMin: durationMinutesValue,
        notes,
      },
    );
    setNotes("");
    setIsRunning(false);
    setStartedAt(null);
    setElapsedSeconds(0);
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="card-dark rounded-[1.25rem] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Total Minutes</p>
          <p className="mt-3 text-3xl font-semibold">{summary?.totalMinutes ?? 0}</p>
        </div>
        <div className="card-dark rounded-[1.25rem] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Sessions</p>
          <p className="mt-3 text-3xl font-semibold">{summary?.totalSessions ?? 0}</p>
        </div>
        <div className="card-dark rounded-[1.25rem] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted">Average Session</p>
          <p className="mt-3 text-3xl font-semibold">{summary?.avgSessionMinutes ?? 0}m</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="card-dark rounded-[1.25rem] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-saffron">Live Timer</p>
          <div className="mt-4 card-dark rounded-[1.25rem] p-5 text-center">
            <p className="font-mono text-5xl font-semibold tracking-[0.2em]">{formatClock(elapsedSeconds)}</p>
            <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted">{isRunning ? "Running" : "Idle"}</p>
          </div>
          <div className="mt-4 flex gap-3">
            {!isRunning ? (
              <Button
                className="flex-1 gap-2"
                onClick={() => {
                  if (!taskId) {
                    return;
                  }
                  setStartedAt(new Date());
                  setElapsedSeconds(0);
                  setIsRunning(true);
                }}
                disabled={!taskId}
                title={!taskId ? "Select a task first" : undefined}
              >
                <Play className="size-4" />
                Start
              </Button>
            ) : (
              <Button
                className="flex-1 gap-2"
                onClick={() => void submitLog(Math.max(1, Math.round(elapsedSeconds / 60)), startedAt?.toISOString())}
                disabled={isCreating}
              >
                <Square className="size-4" />
                Stop & Log
              </Button>
            )}
          </div>
          {!taskId ? <p className="mt-2 text-xs text-muted">Select a task first</p> : null}
        </div>

        <div className="card-dark rounded-[1.25rem] p-6">
          <p className="text-xs uppercase tracking-[0.28em] text-saffron">Manual Log</p>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-2 block text-sm text-muted">Task</span>
              <select
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
                className="input-field"
              >
                <option value="" disabled>
                  Select a task...
                </option>
                {taskData.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span className="mb-2 block text-sm text-muted">Duration</span>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-muted">Hours</span>
                  <input
                    value={durationHours}
                    onChange={(event) => setDurationHours(event.target.value)}
                    type="number"
                    min="0"
                    max="23"
                    className="input-field"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-muted">Minutes</span>
                  <input
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(event.target.value)}
                    type="number"
                    min="0"
                    max="59"
                    className="input-field"
                  />
                </label>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={5}
              placeholder="Record engineering work, test notes, or review activity..."
              className="input-field resize-none"
            />
            <Button
              className="w-full"
              onClick={() => void submitLog(totalMinutes)}
              disabled={isCreating || !taskId}
            >
              {isCreating ? "Logging..." : "Submit Worklog"}
            </Button>
          </div>
        </div>

        <div className="card-dark rounded-[1.25rem] p-6 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.28em] text-saffron">Recent Sessions</p>
          <div className="mt-4 space-y-3">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-steel/30 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{log.task?.title ?? "Unlinked Task"}</p>
                  <span className="text-xs text-saffron">{formatDuration(log.durationMin)}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{log.notes}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-muted">
                  <span>{log.user?.name ?? "Operator"}</span>
                  <span>
                    {new Date(log.startedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}