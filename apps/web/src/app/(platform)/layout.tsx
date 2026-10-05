import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 py-6 pb-24 md:px-6 lg:pb-6">
      <div className="mx-auto flex w-full max-w-[1800px] gap-6">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </div>
      </div>
      <MobileNav />
    </div>
  );
}
