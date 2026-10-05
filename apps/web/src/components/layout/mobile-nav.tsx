"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { navLinks } from "@/lib/nav-links";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-3 z-40 mx-auto flex max-w-[calc(100vw-1.5rem)] gap-1 rounded-full border border-white/10 bg-white/5 p-2 shadow-glass backdrop-blur-xl lg:hidden">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const active = (pathname === href || pathname.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              data-transition="true"
              aria-current={active ? "page" : undefined}
              className={`flex min-w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-full px-2 py-2 text-[10px] uppercase tracking-[0.18em] transition ${
                active ? "border-saffron/40 bg-saffron/10 text-text" : "border-transparent text-muted"
              }`}
            >
              <Icon className="size-4" />
              <span className="whitespace-nowrap">{label}</span>
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        data-transition="true"
        className="rounded-full border border-steel/30 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-muted transition hover:bg-white/5"
        onClick={() => void signOut({ callbackUrl: "/login" })}
      >
        Sign Out
      </button>
    </nav>
  );
}