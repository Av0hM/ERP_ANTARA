"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { ReactNode, useState } from "react";

import { TransitionOverlay } from "@/components/providers/transition-overlay";
import { ToastProvider } from "@/components/ui/toast";

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>{children}</ToastProvider>
        <TransitionOverlay />
      </QueryClientProvider>
    </SessionProvider>
  );
}
