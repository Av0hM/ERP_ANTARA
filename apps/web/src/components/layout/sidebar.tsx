"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { BarChart3, CalendarRange, LayoutDashboard, RadioTower, ScrollText } from "lucide-react";

import { useNotificationCenter } from "@/hooks/use-operations";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Mission Tasks", icon: RadioTower },
  { href: "/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/worklogs", label: "Worklogs", icon: ScrollText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { notifications } = useNotificationCenter();
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <aside className="glass-panel hidden min-h-[calc(100vh-3rem)] w-72 flex-col rounded-[1.6rem] p-5 lg:flex">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.32em] text-saffron">AntaraERP</p>
        <h1 className="mt-3 text-2xl font-semibold">Satellite engineering operations</h1>
        <p className="mt-2 text-sm text-muted">
          AI-assisted coordination for software, avionics, payload, structures, and mission ops.
        </p>
      </div>

      <nav className="space-y-2">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            data-transition="true"
            aria-current={pathname === href ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-sm transition ${
              pathname === href
                ? "border-saffron/40 bg-saffron/10 text-text shadow-glass"
                : "border-transparent text-muted hover:border-steel/30 hover:bg-white/5 hover:text-text"
            }`}
          >
            <span className="relative">
              <Icon className="size-4" />
              {href === "/dashboard" && unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-red-500" />
              ) : null}
            </span>
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto rounded-[1.25rem] border border-steel/30 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.24em] text-ice">Session</p>
        <div className="mt-3">
          <p className="text-base font-semibold">{session?.user?.name ?? "Mission Member"}</p>
          <p className="text-sm text-muted">{session?.user?.email ?? "user@example.com"}</p>
          <span
            className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs uppercase tracking-[0.18em] ${
              session?.user?.role === "OWNER"
                ? "bg-saffron/20 text-saffron"
                : session?.user?.role === "ADMIN"
                ? "bg-ice/20 text-ice"
                : "bg-white/10 text-muted"
            }`}
          >
            {session?.user?.role ?? "MEMBER"}
          </span>
        </div>
        <button
          type="button"
          data-transition="true"
          className="mt-4 w-full rounded-[1.25rem] border border-steel/30 bg-white/5 px-4 py-3 text-sm text-text transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </aside>
  );
}