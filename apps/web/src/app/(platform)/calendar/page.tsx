import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";

export default function CalendarPage() {
  return (
    <main className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-saffron">Calendar</p>
        <h1 className="mt-3 text-4xl font-semibold">Milestones and reviews</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Internal schedule surfaces now support event planning, milestone visibility, and FullCalendar-based navigation, ready for Google Calendar sync adapters.
        </p>
      </section>

      <CalendarWorkspace />
    </main>
  );
}