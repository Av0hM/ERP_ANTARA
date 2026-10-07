"use client";

import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./brand";
import { useShell } from "./app-shell";
import { visibleNavLinks } from "@/lib/nav-links";

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("antara.sidebar.collapsed") === "true");
    } catch {
      /* Storage is optional. */
    }
  }, []);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("antara.sidebar.collapsed", String(next));
    } catch {
      /* Keep the in-memory preference. */
    }
  };
  const { data } = useShell();

  return (
    <aside
      className={`glass-panel hidden shrink-0 min-h-[calc(100vh-3rem)] flex-col rounded-[1.6rem] lg:flex ${collapsed ? "w-20 p-2" : "w-72 p-5"}`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="mb-4 self-end rounded-xl p-3 hover:bg-white/10"
      >
        {collapsed ? (
          <PanelLeftOpen className="size-5" />
        ) : (
          <PanelLeftClose className="size-5" />
        )}
      </button>
      <div className="mb-6">
        <Brand compact={collapsed} />
      </div>

      <nav aria-label="Main navigation" className="space-y-2">
        {visibleNavLinks(data).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            title={collapsed ? label : undefined}
            aria-label={label}
            data-transition="true"
            aria-current={
              pathname === href || pathname.startsWith(`${href}/`)
                ? "page"
                : undefined
            }
            className={`flex items-center gap-3 rounded-[1.25rem] border px-4 py-3 text-sm transition ${
              pathname === href || pathname.startsWith(`${href}/`)
                ? "border-saffron/40 bg-saffron/10 text-text shadow-glass"
                : "border-transparent text-muted hover:border-steel/30 hover:bg-white/5 hover:text-text"
            }`}
          >
            <span className="relative">
              <Icon className="size-4" />
            </span>
            <span className={collapsed ? "sr-only" : undefined}>{label}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
