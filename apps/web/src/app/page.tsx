import Link from "next/link";
import { ArrowRight, Orbit, ShieldCheck, Sparkles, TimerReset } from "lucide-react";

import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Orbit,
    title: "Subsystem-specific operations",
    description: "Separate boards, calendars, documents, and analytics for avionics, payload, software, and mission ops.",
  },
  {
    icon: Sparkles,
    title: "AI mission intelligence",
    description: "Predict schedule slip, summarize technical discussions, redistribute work, and surface burnout signals.",
  },
  {
    icon: TimerReset,
    title: "Real execution visibility",
    description: "Track work sessions, dependency risk, engineering throughput, and live collaboration activity.",
  },
  {
    icon: ShieldCheck,
    title: "Production-grade governance",
    description: "Secure RBAC, audit logs, typed APIs, Dockerized services, and CI-ready workflows.",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-orbital-grid bg-orbital-grid bg-top px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="glass-panel relative overflow-hidden rounded-[2rem] p-8 md:p-12">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
          <p className="text-xs uppercase tracking-[0.36em] text-accent">AntaraERP</p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
            AI-powered operations and collaboration for college satellite engineering teams.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            Startup-grade ERP software built for subsystem coordination, technical execution, workload intelligence, and mission-readiness analytics.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/login">
              <Button className="gap-2">
                Enter Mission Control
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article key={feature.title} className="glass-panel rounded-[1.75rem] p-6">
                <Icon className="size-8 text-accent" />
                <h2 className="mt-5 text-xl font-medium">{feature.title}</h2>
                <p className="mt-3 text-sm text-muted">{feature.description}</p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

