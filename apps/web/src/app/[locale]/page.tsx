import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, Orbit, ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import { Button } from "@/components/ui/button";

const featureIcons = [
  { icon: Orbit, title: "subsystemOperations", description: "subsystemOperationsDesc" },
  { icon: Sparkles, title: "aiIntelligence", description: "aiIntelligenceDesc" },
  { icon: TimerReset, title: "realExecutionVisibility", description: "realExecutionVisibilityDesc" },
  { icon: ShieldCheck, title: "productionGovernance", description: "productionGovernanceDesc" },
];

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  const tFeatures = await getTranslations({ locale, namespace: "landing" });

  return (
    <main className="min-h-screen section-dark grid-texture-dark px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <section className="section-dark grid-texture-dark rounded-[2rem] p-8 md:p-12 relative overflow-hidden">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-saffron/10 blur-3xl" />
          <p className="text-xs uppercase tracking-[0.36em] text-saffron">{t("appName")}</p>
          <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted">
            {t("heroDescription")}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href={`/${t("login")}`}>
              <Button className="gap-2">
                {t("enterMissionControl")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {featureIcons.map((feature) => {
            const Icon = feature.icon;

            return (
              <article key={feature.title} className="card-dark rounded-[1.25rem] p-6">
                <Icon className="size-8 text-saffron" />
                <h2 className="mt-5 text-xl font-medium">{tFeatures(feature.title)}</h2>
                <p className="mt-3 text-sm text-muted">{tFeatures(feature.description)}</p>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}