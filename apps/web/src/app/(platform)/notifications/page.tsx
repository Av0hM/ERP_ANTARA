"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useActorProfile } from "@/hooks/use-actor-profile";
import { useNotificationCenter } from "@/hooks/use-operations";
import { fetchNotificationHistory } from "@/lib/operations-api";
import { useShell } from "@/components/layout/app-shell";
export default function NotificationsPage() {
  const actor = useActorProfile();
  const { data } = useShell();
  const actions = useNotificationCenter();
  const history = useInfiniteQuery({
    queryKey: ["notifications", "history", actor?.accessToken],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchNotificationHistory(actor!.accessToken, pageParam),
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!actor,
    refetchOnWindowFocus: true,
  });
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-semibold">Notifications</h1>
      <p>
        {data.unreadCount
          ? `${data.unreadCount} unread`
          : "No unread notifications."}
      </p>
      {data.unreadCount > 0 && (
        <button
          className="rounded-lg border border-steel/30 p-3"
          disabled={actions.isUpdating}
          onClick={actions.markAllAsRead}
        >
          Mark all as read
        </button>
      )}
      {history.isLoading ? (
        <p role="status">Loading notifications…</p>
      ) : history.isError ? (
        <p role="alert">
          Unable to load notifications.{" "}
          <button className="underline" onClick={() => void history.refetch()}>
            Retry
          </button>
        </p>
      ) : !items.length ? (
        <p>No notifications yet.</p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="card-dark rounded-xl p-5">
            <h2>{item.title}</h2>
            <p className="my-2 text-muted">{item.body}</p>
            <div className="flex gap-4">
              <button
                disabled={actions.isUpdating}
                className="underline"
                onClick={() => actions.markRead(item.id, !item.isRead)}
              >
                {item.isRead ? "Mark unread" : "Mark read"}
              </button>
              <button
                disabled={actions.isUpdating}
                className="underline"
                onClick={() => actions.deleteNotification(item.id)}
              >
                Delete notification
              </button>
            </div>
          </article>
        ))
      )}
      {history.hasNextPage && (
        <button
          disabled={history.isFetchingNextPage}
          className="underline"
          onClick={() => void history.fetchNextPage()}
        >
          Load older notifications
        </button>
      )}
    </main>
  );
}
