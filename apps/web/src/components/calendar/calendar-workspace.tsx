"use client";

import { useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import { Button } from "@/components/ui/button";
import { useCalendarData, useSubsystemCatalog } from "@/hooks/use-operations";

export function CalendarWorkspace() {
  const { events, createEvent, isCreating } = useCalendarData();
  const { data: subsystemData = [] } = useSubsystemCatalog();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [subsystemId, setSubsystemId] = useState("Software");

  useEffect(() => {
    if (subsystemData[0] && subsystemId === "Software") {
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
      <section className="glass-panel rounded-[2rem] p-6">
        <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="overflow-hidden rounded-3xl border border-line bg-white/5 p-4">
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
            <div className="rounded-3xl border border-line bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-accent">Create Event</p>
              <div className="mt-4 space-y-3">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Integration review"
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm outline-none"
                />
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm outline-none"
                />
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm outline-none"
                />
                <select
                  value={subsystemId}
                  onChange={(event) => setSubsystemId(event.target.value)}
                  className="w-full rounded-2xl border border-line bg-panel px-4 py-3 text-sm outline-none"
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
                  disabled={isCreating || !title || !startsAt || !endsAt}
                >
                  {isCreating ? "Scheduling..." : "Schedule Event"}
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-line bg-white/5 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-accent">Upcoming Milestones</p>
              <div className="mt-4 space-y-3">
                {events.slice(0, 4).map((event) => (
                  <div key={event.id} className="rounded-2xl border border-line bg-panel p-4">
                    <p className="font-medium">{event.title}</p>
                    <p className="mt-1 text-sm text-muted">{event.description}</p>
                    <p className="mt-2 text-xs text-muted">
                      {new Date(event.startsAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
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
