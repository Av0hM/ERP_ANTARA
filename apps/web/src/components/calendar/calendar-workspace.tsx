"use client";
import { OperationFeedback } from "@/components/ui/operation-feedback";
import { useShell } from "@/components/layout/app-shell";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const {
    events,
    createEvent,
    isCreating,
    error,
    isLoading,
    retry,
    saveError,
    isSaved,
    integrationStatus,
  } = useCalendarData();
  const subsystemData = shell.data.contexts
    .filter((context) => context.subsystemId && context.canManage)
    .map((context) => ({ id: context.subsystemId!, name: context.label }));
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [subsystemId, setSubsystemId] = useState("");
  const [validation, setValidation] = useState("");
  const submitting = useRef(false);

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
      <OperationFeedback
        state={error ? "error" : isLoading ? "loading" : "idle"}
        error={error}
        onRetry={retry}
        page="Calendar"
      />
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
        <div className="grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="min-w-0 overflow-hidden card-dark rounded-[1.25rem] border border-steel/30 p-4 [&_.fc-header-toolbar]:flex-wrap [&_.fc-header-toolbar]:gap-3 [&_.fc-toolbar-title]:text-lg">
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
                <OperationFeedback
                  state={
                    isCreating
                      ? "saving"
                      : saveError
                        ? "error"
                        : isSaved
                          ? "success"
                          : "idle"
                  }
                  error={saveError}
                  preserved={!!saveError}
                  message={
                    isSaved && !saveError
                      ? integrationStatus === "SYNCED"
                        ? "Event saved in ANTARA ERP. Google Calendar synced."
                        : integrationStatus === "NOT_CONFIGURED"
                          ? "Event saved in ANTARA ERP. Google Calendar is not configured; no external event was created."
                          : "Event saved in ANTARA ERP. Check Upcoming Milestones before scheduling another event."
                      : undefined
                  }
                  page="Calendar"
                />
                <p className="text-xs uppercase tracking-[0.2em] text-saffron">
                  Create Event
                </p>
                <div className="mt-4 space-y-3">
                  <label htmlFor="calendar-title" className="block text-sm">
                    Event title
                  </label>
                  <input
                    id="calendar-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Integration review"
                    className="input-field"
                  />
                  <label htmlFor="calendar-start" className="block text-sm">
                    Starts at
                  </label>
                  <input
                    id="calendar-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    className="input-field"
                  />
                  <label htmlFor="calendar-end" className="block text-sm">
                    Ends at
                  </label>
                  <input
                    id="calendar-end"
                    aria-describedby={
                      validation ? "calendar-validation" : undefined
                    }
                    aria-invalid={!!validation}
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    className="input-field"
                  />
                  <label htmlFor="calendar-subsystem" className="block text-sm">
                    Subsystem
                  </label>
                  <select
                    id="calendar-subsystem"
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
                  {validation && (
                    <p role="alert" id="calendar-validation">
                      {validation}
                    </p>
                  )}
                  <Button
                    className="w-full"
                    onClick={() => {
                      if (isCreating || submitting.current) return;
                      const start = Date.parse(startsAt);
                      const end = Date.parse(endsAt);
                      if (
                        !Number.isFinite(start) ||
                        !Number.isFinite(end) ||
                        end <= start
                      ) {
                        setValidation(
                          "Choose an end time after the start time.",
                        );
                        return;
                      }
                      setValidation("");
                      submitting.current = true;
                      createEvent(
                        {
                          title: title.trim(),
                          startsAt: new Date(startsAt).toISOString(),
                          endsAt: new Date(endsAt).toISOString(),
                          subsystemId,
                        },
                        {
                          onSettled: () => {
                            submitting.current = false;
                          },
                        },
                      );
                    }}
                    disabled={
                      isCreating ||
                      !title.trim() ||
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
