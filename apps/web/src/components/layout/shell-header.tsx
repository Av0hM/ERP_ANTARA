"use client";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import { Bell, LogOut, RefreshCw, UserRound } from "lucide-react";
import { useShell } from "./app-shell";
import { Brand } from "./brand";
import { useNotificationCenter } from "@/hooks/use-operations";
const panel =
  "z-[80] max-h-[70vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-steel/40 bg-slate-950 p-3 text-text shadow-xl";
const item =
  "block w-full cursor-pointer rounded-lg p-3 text-left text-sm outline-none focus:bg-white/10 data-[highlighted]:bg-white/10";
export function ShellHeader() {
  const { data, current, select, refresh, logout } = useShell();
  const notifications = useNotificationCenter();
  return (
    <header className="mb-6 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-steel/30 bg-white/5 p-3">
      <div className="mr-auto lg:hidden">
        <Brand />
      </div>
      <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto">
        {data.contexts.length > 1 ? (
          <label className="min-w-0 flex-1 sm:flex-none">
            <span className="sr-only">Dashboard context</span>
            <select
              aria-label="Dashboard context"
              value={current.id}
              onChange={(event) => select(event.target.value)}
              className="input-field max-w-full sm:max-w-64 text-sm"
            >
              {data.contexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {context.label}
                  {context.subsystemId
                    ? context.canManage
                      ? " — Admin"
                      : " — Read"
                    : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="min-w-0 flex-1 text-sm">{current.label}</span>
        )}
        <button
          type="button"
          aria-label="Refresh available contexts"
          title="Refresh access"
          onClick={refresh}
          className="shrink-0 rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-saffron"
        >
          <RefreshCw className="size-4" />
        </button>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button
              type="button"
              aria-label={`Notifications, ${data.unreadCount} unread`}
              className="relative shrink-0 rounded-lg p-2 focus-visible:ring-2 focus-visible:ring-saffron"
            >
              <Bell className="size-5" />
              {data.unreadCount > 0 && (
                <span className="absolute -right-1 -top-2 rounded-full bg-saffron px-1.5 text-xs font-bold text-slate-950">
                  {data.unreadCount > 99 ? "99+" : data.unreadCount}
                </span>
              )}
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="end"
              sideOffset={10}
              collisionPadding={12}
              className={panel}
              aria-label="Recent notifications"
            >
              <Dropdown.Label className="p-2 font-semibold">
                Notifications
              </Dropdown.Label>
              {notifications.isLoading ? (
                <p role="status" className="p-2 text-sm">
                  Loading notifications…
                </p>
              ) : notifications.error ? (
                <Dropdown.Item className={item} onSelect={notifications.retry}>
                  Unable to load notifications. Retry
                </Dropdown.Item>
              ) : notifications.notifications.length === 0 ? (
                <p className="p-2 text-sm text-muted">No notifications yet.</p>
              ) : (
                notifications.notifications.slice(0, 5).map((notification) => (
                  <Dropdown.Item
                    key={notification.id}
                    className={item}
                    onSelect={(event) => {
                      event.preventDefault();
                      if (!notification.isRead)
                        notifications.markRead(notification.id, true);
                    }}
                  >
                    <span className="block font-medium">
                      {notification.title}
                    </span>
                    <span className="block text-muted">
                      {notification.body}
                    </span>
                    <span className="block text-xs">
                      {notification.isRead
                        ? "Read"
                        : "Unread — select to mark read"}
                    </span>
                  </Dropdown.Item>
                ))
              )}
              {data.unreadCount === 0 && (
                <p className="p-2 text-xs text-muted">
                  No unread notifications.
                </p>
              )}
              {data.unreadCount > 0 && (
                <Dropdown.Item
                  disabled={notifications.isUpdating}
                  className={item}
                  onSelect={(event) => {
                    event.preventDefault();
                    notifications.markAllAsRead();
                  }}
                >
                  Mark all as read
                </Dropdown.Item>
              )}
              <Dropdown.Separator className="my-1 h-px bg-white/10" />
              <Dropdown.Item asChild className={item}>
                <Link href="/notifications">View all notifications</Link>
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <button
              type="button"
              aria-label="Open profile menu"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-steel/30 bg-saffron/10 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-saffron"
            >
              {data.user.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("") || <UserRound className="size-5" />}
            </button>
          </Dropdown.Trigger>
          <Dropdown.Portal>
            <Dropdown.Content
              align="end"
              sideOffset={10}
              collisionPadding={12}
              className={panel}
              aria-label="Profile menu"
            >
              <Dropdown.Label className="p-3">
                <span className="block break-words font-semibold">
                  {data.user.name}
                </span>
                <span className="text-xs text-muted">{data.user.role}</span>
              </Dropdown.Label>
              <Dropdown.Separator className="h-px bg-white/10" />
              <Dropdown.Item className={item} onSelect={logout}>
                <span className="flex items-center gap-2">
                  <LogOut className="size-4" />
                  Sign out
                </span>
              </Dropdown.Item>
            </Dropdown.Content>
          </Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </header>
  );
}
