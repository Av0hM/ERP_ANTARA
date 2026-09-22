"use client";

import { ResourceAllocationBoardView } from "@/components/resources/resource-allocation-board";
import { useResourceAllocationBoard } from "@/hooks/use-operations";

export default function ResourcesPage() {
  const { data, isLoading, refetch } = useResourceAllocationBoard(4);

  return (
    <div className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-saffron">Resource Management</p>
            <h1 className="mt-2 text-3xl font-semibold">Team Capacity Board</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Visualize team capacity across subsystems and weeks. Drag tasks to balance workload and resolve conflicts.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              disabled={isLoading}
              className="rounded-[1.25rem] border border-steel/30 bg-white/5 px-4 py-2 text-sm outline-none flex items-center gap-2 text-muted hover:text-text"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </section>

      <ResourceAllocationBoardView
        data={data}
        isLoading={isLoading}
        horizonWeeks={4}
        onRefresh={refetch}
      />
    </div>
  );
}