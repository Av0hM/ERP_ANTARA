"use client";

import { Bell, CheckCircle2, Trash2 } from "lucide-react";

import { useNotificationCenter } from "@/hooks/use-operations";

export function NotificationCenter() {
  const { notifications, markRead, deleteNotification, markAllAsRead } = useNotificationCenter();
  const unreadCount = notifications.filter((notification) => !notification.isRead).length;

  return (
    <div className="card-dark rounded-[1.25rem] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="size-5 text-saffron" />
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-saffron">Notifications</p>
            <h2 className="text-xl font-semibold">Operational alerts</h2>
          </div>
        </div>
        {unreadCount > 0 ? (
          <button type="button" className="rounded-full border border-steel/30 px-3 py-1 text-xs text-muted transition hover:bg-white/5" onClick={markAllAsRead}>
            Mark all as read
          </button>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        {notifications.map((notification) => (
          <article key={notification.id} className="rounded-xl border border-steel/30 bg-white/5 p-4">
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
                    notification.isRead ? "border-steel/30 text-muted" : "border-saffron text-saffron"
                  }`}
                >
                  {notification.isRead ? "Read" : "Unread"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteNotification(notification.id)}
                  className="rounded-full border border-steel/30 p-2 text-muted transition hover:bg-white/5"
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