import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ErrorBoundary } from "@/components/ui/error-boundary";
export default function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-8">
          Loading workspace…
        </p>
      }
    >
      <AppShell>
        <ErrorBoundary>{children}</ErrorBoundary>
      </AppShell>
    </Suspense>
  );
}
