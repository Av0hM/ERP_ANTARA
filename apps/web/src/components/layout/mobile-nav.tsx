"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { BarChart3, CalendarRange, LayoutDashboard, RadioTower, ScrollText } from "lucide-react";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tasks", label: "Tasks", icon: RadioTower },
  { href: "/calendar", label: "Calendar", icon: CalendarRange },
  { href: "/worklogs", label: "Logs", icon: ScrollText },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-3 z-40 mx-auto flex max-w-[calc(100vw-1.5rem)] gap-1 rounded-full border border-line bg-panel/95 p-2 shadow-glow backdrop-blur-xl lg:hidden">
      <div className="flex flex-1 gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              data-transition="true"
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                active ? "border-accent/40 bg-accent/10 text-text" : "border-transparent text-muted"
              }`}
            >
              <Icon className="size-4" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        data-transition="true"
        className="rounded-full border border-line px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted transition hover:bg-white/5"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        Sign Out
      </button>
    </nav>
  );
}
