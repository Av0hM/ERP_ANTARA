"use client";
import Link from "next/link";
import { useShell } from "@/components/layout/app-shell";
export default function SubsystemsPage() {
  const { data } = useShell();
  const subsystems = data.contexts.filter((context) => context.subsystemId);
  return (
    <main>
      <h1 className="mb-5 text-3xl font-semibold">Subsystems</h1>
      {!subsystems.length ? (
        <p>
          No readable subsystem memberships. Ask an OWNER to review your access.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {subsystems.map((subsystem) => (
            <Link
              key={subsystem.id}
              href={`/dashboard?context=${encodeURIComponent(subsystem.id)}`}
              className="card-dark rounded-xl p-5"
            >
              <h2 className="text-xl">{subsystem.label}</h2>
              <p className="mt-2 text-muted">
                {subsystem.canManage ? "Administrative access" : "Read access"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
