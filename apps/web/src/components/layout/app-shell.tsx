"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession, signOut } from "next-auth/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DashboardContext, UiContext } from "@antara/contracts";
import { fetchUiContext } from "@/lib/operations-api";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { ShellHeader } from "./shell-header";

interface ShellState {
  data: UiContext;
  current: DashboardContext;
  select: (id: string) => void;
  refresh: () => void;
  logout: () => void;
}
const ShellContext = createContext<ShellState | null>(null);
export function useShell() {
  const state = useContext(ShellContext);
  if (!state) throw new Error("Authenticated shell required");
  return state;
}
export function useOptionalShell() {
  return useContext(ShellContext);
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const client = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [leaving, setLeaving] = useState(false);
  const [preference, setPreference] = useState<{
    userId: string;
    id: string | null;
  }>();
  const [accepted, setAccepted] = useState("");
  const [notice, setNotice] = useState("");
  const token = session?.accessToken;
  const context = useQuery({
    queryKey: ["ui-context", token],
    queryFn: () => fetchUiContext(token!),
    enabled: status === "authenticated" && !!token && !leaving,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: "always",
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const logout = useCallback(async () => {
    setLeaving(true);
    await client.cancelQueries();
    client.clear();
    try {
      await signOut({ redirect: false });
      window.location.replace("/login");
    } catch {
      setNotice("Sign out could not finish. Please retry.");
      setLeaving(false);
    }
  }, [client]);
  useEffect(() => {
    if (status === "unauthenticated") {
      client.clear();
      router.replace("/login");
    }
    if (session?.error || (status === "authenticated" && !token)) void logout();
  }, [status, session?.error, token, client, router, logout]);
  useEffect(() => {
    const handle = (event: Event) => {
      if ((event as CustomEvent<number>).detail === 401) void logout();
      else {
        setNotice("Access changed. Available contexts have been refreshed.");
        void client.invalidateQueries({ queryKey: ["ui-context"] });
      }
    };
    window.addEventListener("antara:access-changed", handle);
    return () => window.removeEventListener("antara:access-changed", handle);
  }, [client, logout]);
  const data = context.data;
  const signature = data
    ? JSON.stringify([
        data.user.id,
        data.user.role,
        data.contexts,
        data.permissions,
      ])
    : "";
  useEffect(() => {
    if (!signature || signature === accepted) return;
    void client.cancelQueries({
      predicate: (query) => query.queryKey[0] !== "ui-context",
    });
    client.removeQueries({
      predicate: (query) => query.queryKey[0] !== "ui-context",
    });
    setAccepted(signature);
  }, [signature, accepted, client]);
  useEffect(() => {
    if (!data) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(`antara.context.${data.user.id}`);
    } catch {
      /* Optional preference. */
    }
    setPreference({ userId: data.user.id, id: saved });
  }, [data?.user.id]);
  const requested = pathname === "/dashboard" ? params.get("context") : null;
  const current = useMemo(
    () =>
      data?.contexts.find(
        (item) => item.id === (requested ?? preference?.id),
      ) ?? data?.contexts.find((item) => item.id === data.defaultContextId),
    [data, requested, preference],
  );
  useEffect(() => {
    if (!data || !current || preference?.userId !== data.user.id) return;
    try {
      localStorage.setItem(`antara.context.${data.user.id}`, current.id);
    } catch {
      /* Optional preference. */
    }
    if (requested && requested !== current.id)
      router.replace(`/dashboard?context=${encodeURIComponent(current.id)}`);
  }, [data, current, preference?.userId, requested, router]);
  if (leaving || status !== "authenticated")
    return (
      <p role="status" className="p-8">
        {leaving ? "Signing out…" : "Loading your session…"}
      </p>
    );
  if (context.isError)
    return (
      <div className="p-8" role="alert">
        <p>
          Unable to verify your current access. Protected content is hidden.
        </p>
        <button
          className="m-3 underline"
          onClick={() => void context.refetch()}
        >
          Retry access check
        </button>
        <button className="underline" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    );
  if (
    !data ||
    !current ||
    signature !== accepted ||
    preference?.userId !== data.user.id
  )
    return (
      <p role="status" className="p-8">
        Loading available contexts…
      </p>
    );
  const select = (id: string) => {
    if (!data.contexts.some((item) => item.id === id)) return;
    setPreference({ userId: data.user.id, id });
    router.push(`/dashboard?context=${encodeURIComponent(id)}`);
  };
  return (
    <ShellContext.Provider
      value={{
        data,
        current,
        select,
        refresh: () => {
          void context.refetch();
        },
        logout: () => {
          void logout();
        },
      }}
    >
      <div className="min-h-screen px-3 py-4 pb-28 md:px-6 lg:pb-6">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:z-[100] focus:bg-slate-950 focus:p-3"
        >
          Skip to content
        </a>
        <div className="mx-auto flex w-full max-w-[1800px] gap-4 md:gap-6">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <ShellHeader />
            {notice && (
              <p role="status" className="my-3 text-sm text-muted">
                {notice}
              </p>
            )}
            <div id="main-content" tabIndex={-1} key={signature}>
              {children}
            </div>
          </div>
        </div>
        <MobileNav />
      </div>
    </ShellContext.Provider>
  );
}
