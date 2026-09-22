import { BellRing, Radar, Users } from "lucide-react";

import { ActivityFeedRecord, PresenceRecord } from "@/lib/task-types";

type CollaborationSidebarProps = {
  presence: PresenceRecord[];
  activity: ActivityFeedRecord[];
};

export function CollaborationSidebar({ presence, activity }: CollaborationSidebarProps) {
  return (
    <aside className="space-y-6">
      <section className="card-dark rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3">
          <Users className="size-5 text-saffron" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Presence</p>
            <h3 className="text-lg font-semibold">Online collaborators</h3>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {presence.length === 0 ? (
            <p className="text-sm text-muted">Waiting for live presence. The API gateway will populate this when clients connect.</p>
          ) : (
            presence.map((person) => (
              <div key={person.socketId} className="rounded-xl border border-steel/30 bg-white/5 p-3">
                <div>
                  <p className="font-medium">{person.name}</p>
                  <p className="text-xs text-muted">{person.userId}</p>
                </div>
                <span className="size-2 rounded-full bg-saffron" />
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card-dark rounded-[1.25rem] p-6">
        <div className="flex items-center gap-3">
          <Radar className="size-5 text-saffron" />
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Activity Feed</p>
            <h3 className="text-lg font-semibold">Recent engineering signals</h3>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          {activity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-steel/30 p-4 text-sm text-muted">
              No recent activity yet. Task changes, comments, and AI signals will appear here in realtime.
            </p>
          ) : (
            activity.map((item) => (
              <article key={item.id} className="rounded-xl border border-steel/30 bg-white/5 p-4">
                <div className="flex items-center gap-2 text-saffron">
                  <BellRing className="size-4" />
                  <span className="text-xs uppercase tracking-[0.2em]">{item.type}</span>
                </div>
                <p className="mt-3 font-medium">{item.title}</p>
                <p className="mt-2 text-sm text-muted">{item.description}</p>
                <p className="mt-3 text-xs text-muted">
                  {new Date(item.timestamp).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}