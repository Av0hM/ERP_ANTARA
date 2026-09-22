import { WorklogWorkspace } from "@/components/worklogs/worklog-workspace";
import { AttachmentVault } from "@/components/files/attachment-vault";

export const dynamic = "force-dynamic";

export default function WorklogsPage() {
  return (
    <main className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-8">
        <p className="text-xs uppercase tracking-[0.28em] text-saffron">Worklogs</p>
        <h1 className="mt-3 text-4xl font-semibold">Engineering effort tracking</h1>
        <p className="mt-3 max-w-2xl text-muted">
          Timer sessions, manual logs, and contribution analytics now flow through a working operational surface with recent sessions and summary metrics.
        </p>
      </section>

      <WorklogWorkspace />
      <AttachmentVault />
    </main>
  );
}