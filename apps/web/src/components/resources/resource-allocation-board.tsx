"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  User,
  AlertCircle,
  ArrowRight,
  Brain,
  Loader2,
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Users,
  Clock,
  Zap,
  Brain as BrainIcon,
} from "lucide-react";
import { TaskPriority, TaskStatus } from "@antara/contracts";

import { ResourceAllocationBoard, ResourceAllocationUser, WeeklyAllocation, ResourceAllocationConflict, ResourceAllocationAiSuggestion } from "@/lib/operations-types";
import { useResourceAllocationBoard, useSuggestedMoves, useApplyResourceMove } from "@/hooks/use-operations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const priorityColors: Record<string, string> = {
  [TaskPriority.CRITICAL]: "bg-red-500/20 text-red-400 border-red-500/30",
  [TaskPriority.HIGH]: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  [TaskPriority.MEDIUM]: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  [TaskPriority.LOW]: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

const severityColors: Record<string, string> = {
  HIGH: "bg-red-500/20 text-red-400 border-red-500/30",
  MEDIUM: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  LOW: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

interface ResourceAllocationBoardProps {
  data?: ResourceAllocationBoard;
  isLoading?: boolean;
  horizonWeeks?: number;
  onRefresh?: () => void;
}

export function ResourceAllocationBoardView({
  data,
  isLoading,
  horizonWeeks = 4,
  onRefresh,
}: ResourceAllocationBoardProps) {
  const [activeWeek, setActiveWeek] = useState(0);
  const [showConflicts, setShowConflicts] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "load" | "availability">("load");

  const suggestions = useSuggestedMoves();
  const applyMove = useApplyResourceMove();

  const users = useMemo(() => {
    if (!data) return [];
    let filtered = data.users;

    if (searchQuery) {
      filtered = filtered.filter(
        (u) =>
          u.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.subsystemName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    switch (sortBy) {
      case "name":
        return [...filtered].sort((a, b) => a.userName.localeCompare(b.userName));
      case "load":
        return [...filtered].sort((a, b) => b.currentWeeklyLoadHours - a.currentWeeklyLoadHours);
      case "availability":
        return [...filtered].sort((a, b) => a.availabilityScore - b.availabilityScore);
      default:
        return filtered;
    }
  }, [data, searchQuery, sortBy]);

  const weeks = data?.weeks ?? [];
  const conflicts = data?.conflicts ?? [];
  const aiSuggestions = data?.aiSuggestions ?? [];

  const currentWeek = weeks[activeWeek];
  const currentWeekAllocations = currentWeek?.allocations ?? [];

  const getUserWeeklyLoad = useCallback(
    (userId: string, weekIndex: number) => {
      const week = weeks[weekIndex];
      if (!week) return 0;
      return week.allocations
        .filter((a) => a.userId === userId)
        .reduce((sum, a) => sum + a.hours, 0);
    },
    [weeks],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        console.log("Drag ended", { active: active.id, over: over.id });
      }
    },
    [],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="section-dark grid-texture-dark rounded-[2rem] p-6 animate-pulse">
          <div className="h-8 w-48 bg-white/10 rounded-xl" />
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card-dark rounded-[1.25rem] p-6 animate-pulse">
              <div className="h-4 w-24 bg-white/10 rounded-xl" />
              <div className="mt-3 h-10 w-16 bg-white/10 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="section-dark grid-texture-dark rounded-[2rem] p-6 animate-pulse">
          <div className="h-4 w-64 bg-white/10 rounded-xl mb-4" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.users.length === 0) {
    return (
      <div className="section-dark grid-texture-dark rounded-[2rem] border border-dashed border-steel/30 p-12 text-center text-muted">
        <Users className="size-16 mx-auto mb-4 opacity-30" />
        <h3 className="text-lg font-semibold">No team members found</h3>
        <p className="mt-1 text-sm">Add team members to see resource allocation</p>
      </div>
    );
  }

  const totalConflicts = conflicts.length;
  const highConflicts = conflicts.filter((c) => c.severity === "HIGH").length;
  const totalCapacity = users.reduce((sum, u) => sum + u.weeklyCapacityHours, 0);
  const totalLoad = users.reduce((sum, u) => sum + u.currentWeeklyLoadHours, 0);
  const overallUtilization = totalCapacity > 0 ? Math.round((totalLoad / totalCapacity) * 100) : 0;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        <section className="section-dark grid-texture-dark rounded-[2rem] p-6 md:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-saffron">Resource Allocation</p>
              <h1 className="mt-2 text-3xl font-semibold">Team Capacity Board</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted">
                Drag tasks between team members to balance workload. AI suggestions highlight rebalancing opportunities.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={onRefresh} disabled={onRefresh === undefined}>
                <Loader2 className="size-4" />
                Refresh
              </Button>
              <Button variant="secondary" onClick={() => setShowConflicts(!showConflicts)}>
                <AlertTriangle className="size-4" />
                {showConflicts ? "Hide" : "Show"} Conflicts ({totalConflicts})
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card-dark rounded-xl p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Team Members</p>
              <p className="mt-2 text-3xl font-semibold">{users.length}</p>
            </div>
            <div className="card-dark rounded-xl p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Total Capacity</p>
              <p className="mt-2 text-3xl font-semibold">{totalCapacity}h/week</p>
            </div>
            <div className="card-dark rounded-xl p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Current Load</p>
              <p className="mt-2 text-3xl font-semibold">{totalLoad}h/week</p>
            </div>
            <div className="card-dark rounded-xl p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Utilization</p>
              <p className="mt-2 text-3xl font-semibold">{overallUtilization}%</p>
            </div>
          </div>

          {/* Search/Sort form section - light/paper treatment */}
          <div className="mt-6 section-light grid-texture-light rounded-[1.25rem] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-saffron mb-3">Filters & Sort</p>
            <div className="flex flex-wrap gap-2">
              <label className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-secondary-ink" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search team members..."
                  className="input-field-light w-full sm:w-64 pl-10"
                />
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "load" | "availability")}
                className="select-field-light"
              >
                <option value="load" className="bg-paper-highlight text-admin-ink">Sort by Load</option>
                <option value="name" className="bg-paper-highlight text-admin-ink">Sort by Name</option>
                <option value="availability" className="bg-paper-highlight text-admin-ink">Sort by Availability</option>
              </select>
            </div>
          </div>
        </section>

        {showConflicts && conflicts.length > 0 && (
          <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertCircle className="size-5 text-red-400" />
                Conflicts Detected ({totalConflicts})
              </h2>
              {highConflicts > 0 && (
                <span className="text-xs px-2 py-1 rounded-full bg-red-500/20 text-red-400">
                  {highConflicts} High Severity
                </span>
              )}
            </div>
            <div className="space-y-3">
              {conflicts.map((conflict, index) => (
                <div
                  key={index}
                  className={cn(
                    "rounded-xl p-4 border",
                    severityColors[conflict.severity],
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="font-medium">{conflict.description}</p>
                      <p className="mt-1 text-xs text-muted">
                        Type: {conflict.type.replace("_", " ")} • Severity:{' '}
                        <span className={cn("font-medium ml-1", severityColors[conflict.severity])}>
                          {conflict.severity}
                        </span>
                      </p>
                    </div>
                    <AlertTriangle className="size-5 shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold">Weekly Allocation</h2>
              <p className="text-sm text-muted">
                Week {activeWeek + 1} of {weeks.length} •{' '}
                {weeks[activeWeek]
                  ? `${new Date(weeks[activeWeek].weekStart).toLocaleDateString()} - ${new Date(weeks[activeWeek].weekEnd).toLocaleDateString()}`
                  : "No data"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveWeek((w) => Math.max(0, w - 1))}
                disabled={activeWeek === 0}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveWeek((w) => Math.min(weeks.length - 1, w + 1))}
                disabled={activeWeek >= weeks.length - 1}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-steel/20">
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted w-48">Team Member</th>
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted">Role / Subsystem</th>
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted">Capacity</th>
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted">This Week</th>
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted">Utilization</th>
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted">Tasks</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const weekLoad = getUserWeeklyLoad(user.userId, activeWeek);
                  const utilization = user.weeklyCapacityHours > 0 ? Math.round((weekLoad / user.weeklyCapacityHours) * 100) : 0;
                  const isOverloaded = weekLoad > user.weeklyCapacityHours;
                  const userTasks = currentWeekAllocations.filter((a) => a.userId === user.userId);

                  return (
                    <tr key={user.userId} className="border-b border-steel/20 hover:bg-white/5">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-saffron/20 flex items-center justify-center text-saffron text-sm font-medium">
                            {user.userName.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium">{user.userName}</p>
                            <p className="text-xs text-muted">{user.userEmail}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-text">
                            {user.role}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: `${user.subsystemColor}20`, color: user.subsystemColor }}
                          >
                            {user.subsystemName}
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-sm">{user.weeklyCapacityHours}h</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("font-medium", isOverloaded && "text-red-400")}>
                            {weekLoad}h
                          </span>
                          {isOverloaded && <AlertTriangle className="size-4 text-red-400" />}
                        </div>
                      </td>
                      <td className="p-3">
                        <div
                          className={cn(
                            "w-24 h-3 rounded-full bg-white/10 overflow-hidden",
                            isOverloaded && "bg-red-500/20",
                          )}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isOverloaded ? "bg-red-500" : "bg-saffron",
                            )}
                            style={{ width: `${Math.min(utilization, 100)}%` }}
                          />
                        </div>
                        <p className={cn("text-xs mt-1", isOverloaded ? "text-red-400" : "text-muted")}>
                          {utilization}%
                        </p>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {userTasks.slice(0, 3).map((alloc) => {
                            const task = data?.users
                              .flatMap((u) => u.activeTasks)
                              .find((t) => t.id === alloc.tasks[0]);
                            return (
                              <span
                                key={alloc.tasks[0]}
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded-full whitespace-nowrap",
                                  priorityColors[task?.priority ?? ""],
                                )}
                              >
                                {task?.title ?? "Task"}
                              </span>
                            );
                          })}
                          {userTasks.length > 3 && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-muted">
                              +{userTasks.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {showAiSuggestions && aiSuggestions.length > 0 && (
          <section className="section-light grid-texture-light rounded-[2rem] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-admin-ink">
                <BrainIcon className="size-5 text-purple-400" />
                AI Rebalancing Suggestions ({aiSuggestions.length})
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAiSuggestions(!showAiSuggestions)}
              >
                <ChevronUp className="size-4" />
              </Button>
            </div>
            <div className="space-y-3">
              {aiSuggestions.map((suggestion, index) => (
                <div
                  key={index}
                  className="card-light rounded-xl p-4 border border-purple-500/30 bg-purple-500/5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="size-4 text-purple-400" />
                        <span className="text-sm font-medium text-purple-300">AI Suggestion</span>
                      </div>
                      <p className="text-sm text-admin-ink">
                        Move <strong>{suggestion.taskTitle}</strong> from{' '}
                        <strong>{suggestion.fromUserName}</strong> to{' '}
                        <strong>{suggestion.toUserName}</strong>
                      </p>
                      <p className="mt-1 text-xs text-secondary-ink">{suggestion.reason}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() =>
                        suggestion.taskId &&
                        applyMove.mutate({
                          taskId: suggestion.taskId,
                          assigneeId: suggestion.toUserId,
                        })
                      }
                      disabled={applyMove.isPending || !suggestion.taskId}
                    >
                      {applyMove.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <ArrowRight className="size-4 mr-1" />
                          Apply
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
          <h2 className="text-lg font-semibold mb-4">All Weeks Overview</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-steel/20">
                  <th className="text-left p-3 text-xs uppercase tracking-[0.18em] text-muted w-32">Team Member</th>
                  {weeks.map((week, i) => (
                    <th key={i} className="text-center p-3 text-xs uppercase tracking-[0.18em] text-muted w-24">
                      W{i + 1}
                      <br />
                      <span className="text-[10px] text-muted">
                        {new Date(week.weekStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId} className="border-b border-steel/20">
                    <td className="p-3 font-medium w-32">{user.userName}</td>
                    {weeks.map((week, i) => {
                      const load = getUserWeeklyLoad(user.userId, i);
                      const util = user.weeklyCapacityHours > 0 ? Math.round((load / user.weeklyCapacityHours) * 100) : 0;
                      const isOver = load > user.weeklyCapacityHours;
                      return (
                        <td key={i} className="text-center p-3">
                          <div className={cn("font-medium", isOver && "text-red-400")}>{load}h</div>
                          <div className={cn("text-xs", isOver ? "text-red-400" : "text-muted")}>{util}%</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DndContext>
  );
}

export default ResourceAllocationBoardView;