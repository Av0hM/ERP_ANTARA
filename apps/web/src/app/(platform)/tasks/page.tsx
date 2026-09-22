"use client";

import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { useActorProfile } from "@/hooks/use-actor-profile";

export default function TasksPage() {
  const actor = useActorProfile();

  if (!actor) {
    return null;
  }

  return (
    <main className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-saffron">Task Operations</p>
        <h1 className="mt-3 text-4xl font-semibold">Subsystem mission board</h1>
        <p className="mt-3 max-w-2xl text-muted">
          {actor.role} workspace for dependencies, priorities, deadlines, and subsystem ownership across engineering execution.
        </p>
      </section>

      <TaskWorkspace tasks={[]} />
    </main>
  );
}