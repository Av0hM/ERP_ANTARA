"use client";
import { useQuery } from "@tanstack/react-query";
import { useActorProfile } from "@/hooks/use-actor-profile";
import { useShell } from "@/components/layout/app-shell";
import { fetchHandoff } from "@/lib/operations-api";
export default function ReportsPage() {
  const actor = useActorProfile();
  const { data, current } = useShell();
  const permitted = data.permissions.viewReports && current.canManage;
  const report = useQuery({
    queryKey: ["handoff", actor?.accessToken, current.id],
    queryFn: () => fetchHandoff(actor!.accessToken, current.subsystemId),
    enabled: !!actor && permitted,
  });
  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-semibold">Handoff report</h1>
      {!permitted ? (
        <p>This context does not provide administrative reports.</p>
      ) : report.isLoading ? (
        <p role="status">Loading report…</p>
      ) : report.isError ? (
        <p role="alert">{report.error.message}</p>
      ) : (
        <>
          <p className="text-muted">
            Historical analytics are unavailable pending provenance review. This
            report contains authorized current records.
          </p>
          <pre className="whitespace-pre-wrap break-words rounded-xl border border-steel/30 p-5 text-sm">
            {report.data?.markdown}
          </pre>
        </>
      )}
    </main>
  );
}
