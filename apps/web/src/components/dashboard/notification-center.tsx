"use client";

import { Bell, CheckCircle2, Trash2 } from "lucide-react";

import { useNotificationCenter } from "@/hooks/use-operations";

export function NotificationCenter() {
  const { notifications, markRead, deleteNotification, markAllAsRead } = useNotificationCenter();
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <div className="glass-panel rounded-3xl p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="size-5 text-accent" />
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-accent">Notifications</p>
            <h2 className="text-xl font-semibold">Operational alerts</h2>
          </div>
        </div>
        {unreadCount > 0 ? (
          <button type="button" className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:bg-white/5" onClick={markAllAsRead}>
            Mark all as read
          </button>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {notifications.map((notification) => (
          <article key={notification.id} className="rounded-2xl border border-line bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{notification.title}</h3>
                <p className="mt-2 text-sm text-muted">{notification.body}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => markRead(notification.id, !notification.isRead)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    notification.isRead ? "border-line text-muted" : "border-accent text-accent"
                  }`}
                >
                  {notification.isRead ? "Read" : "Unread"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteNotification(notification.id)}
                  className="rounded-full border border-line p-2 text-muted transition hover:bg-white/5"
                  aria-label="Delete notification"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted">
              <span>{notification.type}</span>
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3" />
                {new Date(notification.createdAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
