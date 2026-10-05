"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { navLinks } from "@/lib/nav-links";

import { useNotificationCenter } from "@/hooks/use-operations";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("antara.sidebar.collapsed") === "true"); } catch { /* Storage is optional. */ }
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("antara.sidebar.collapsed", String(next)); } catch { /* Keep the in-memory preference. */ }
  };
  const { data: session, status } = useSession();
  const { notifications } = useNotificationCenter();
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <aside className={`glass-panel hidden shrink-0 min-h-[calc(100vh-3rem)] flex-col rounded-[1.6rem] lg:flex ${collapsed ? "w-20 p-2" : "w-72 p-5"}`}>
      <button type="button" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} className="mb-4 self-end rounded-xl p-3 hover:bg-white/10">
        {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
      </button>
      <div className={collapsed ? "sr-only" : "mb-8"}>
        <p className="text-xs uppercase tracking-[0.32em] text-saffron">AntaraERP</p>
        <h1 className="mt-3 text-2xl font-semibold">Satellite engineering operations</h1>
        <p className="mt-2 text-sm text-muted">
          AI-assisted coordination for software, avionics, payload, structures, and mission ops.
        </p>
      </div>

      <nav aria-label="Main navigation" className="space-y-2">
        {navLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={label}
            data-transition="true"
            aria-current={(pathname === href || pathname.startsWith(`${href}/`)) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-sm transition ${
              (pathname === href || pathname.startsWith(`${href}/`))
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
            <span className={collapsed ? "sr-only" : undefined}>{label}</span>
          </Link>
        ))}
      </nav>

      <div className={`mt-auto rounded-[1.25rem] border border-steel/30 bg-white/5 ${collapsed ? "p-1" : "p-4"}`}>
        <div className={collapsed ? "sr-only" : undefined}>
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
        </div>
        <button
          type="button"
          data-transition="true"
          aria-label="Sign Out"
          title="Sign Out"
          className="mt-4 w-full rounded-[1.25rem] border border-steel/30 bg-white/5 px-4 py-3 text-sm text-text transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void signOut({ callbackUrl: "/login" })}
          disabled={status === "loading"}
        >
          {collapsed ? <LogOut className="mx-auto size-4" /> : status === "loading" ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </aside>
  );
}