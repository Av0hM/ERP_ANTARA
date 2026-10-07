"use client";
import { useShell } from "@/components/layout/app-shell";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import { useActorProfile } from "@/hooks/use-actor-profile";
import { canManageOperations } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useCalendarData, useSubsystemCatalog } from "@/hooks/use-operations";

export function CalendarWorkspace() {
  const actor = useActorProfile();
  const shell = useShell();
  const { events, createEvent, isCreating } = useCalendarData();
  const subsystemData = shell.data.contexts
    .filter((context) => context.subsystemId && context.canManage)
    .map((context) => ({ id: context.subsystemId!, name: context.label }));
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [subsystemId, setSubsystemId] = useState("");

  useEffect(() => {
    if (
      subsystemData[0] &&
      !subsystemData.some((subsystem) => subsystem.id === subsystemId)
    ) {
      setSubsystemId(subsystemData[0].id);
    }
  }, [subsystemData, subsystemId]);

  const calendarEvents = useMemo(
    () =>
      events.map((event) => ({
        id: event.id,
        title: event.title,
        start: event.startsAt,
        end: event.endsAt,
      })),
    [events],
  );

  return (
    <div className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
        <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="overflow-hidden card-dark rounded-[1.25rem] border border-steel/30 p-4">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              height={640}
              events={calendarEvents}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
            />
          </div>

          <div className="space-y-4">
            {shell.data.permissions.manageOperations && (
              <div className="card-dark rounded-[1.25rem] p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-saffron">
                  Create Event
                </p>
                <div className="mt-4 space-y-3">
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Integration review"
                    className="input-field"
                  />
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="input-field"
                  />
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    className="input-field"
                  />
                  <select
                    value={subsystemId}
                    onChange={(event) => setSubsystemId(event.target.value)}
                    className="input-field"
                  >
                    {subsystemData.map((subsystem) => (
                      <option key={subsystem.id} value={subsystem.id}>
                        {subsystem.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="w-full"
                    onClick={() =>
                      createEvent({
                        title,
                        startsAt: new Date(startsAt).toISOString(),
                        endsAt: new Date(endsAt).toISOString(),
                        subsystemId,
                      })
                    }
                    disabled={
                      isCreating ||
                      !title ||
                      !startsAt ||
                      !endsAt ||
                      !subsystemId
                    }
                  >
                    {isCreating ? "Scheduling..." : "Schedule Event"}
                  </Button>
                </div>
              </div>
            )}

            <div className="card-dark rounded-[1.25rem] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-saffron">
                Upcoming Milestones
              </p>
              <div className="mt-4 space-y-3">
                {events.slice(0, 4).map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl border border-steel/30 bg-white/5 p-4"
                  >
                    <p className="font-medium">{event.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {event.description}
                    </p>
                    <p className="mt-2 text-xs text-muted">
                      {new Date(event.startsAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
