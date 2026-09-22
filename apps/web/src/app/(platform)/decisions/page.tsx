"use client";

import { useState } from "react";
import { Plus, Search, Filter, FileText, ChevronDown, X } from "lucide-react";
import { DecisionStatus, DecisionRecord } from "@antara/contracts";

import { useActorProfile } from "@/hooks/use-actor-profile";
import { useDecisions, useCreateDecision } from "@/hooks/use-operations";
import { useSubsystemCatalog } from "@/hooks/use-operations";
import { DecisionList } from "@/components/decisions/decision-log";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusOptions = ["ALL", "PROPOSED", "ACCEPTED", "REJECTED", "SUPERSEDED", "DEFERRED"] as const;
type StatusFilter = (typeof statusOptions)[number];

export default function DecisionsPage() {
  const actor = useActorProfile();
  const { data: subsystemData = [] } = useSubsystemCatalog();
  const { data, isLoading, refetch } = useDecisions();
  const createMutation = useCreateDecision();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [subsystemFilter, setSubsystemFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedDecision, setSelectedDecision] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: "",
    context: "",
    decision: "",
    rationale: "",
    alternatives: "" as string,
    consequences: "",
    subsystemId: "",
    relatedTaskIds: "",
    status: "PROPOSED",
  });

  const filteredDecisions = data?.decisions.filter((d: DecisionRecord) => {
    const matchesStatus = statusFilter === "ALL" || d.status === statusFilter;
    const matchesSubsystem = subsystemFilter === "ALL" || d.subsystemId === subsystemFilter;
    const matchesQuery = searchQuery.length === 0 ||
      d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.context.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.decision.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSubsystem && matchesQuery;
  }) ?? [];

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        title: formData.title,
        context: formData.context,
        decision: formData.decision,
        rationale: formData.rationale,
        alternatives: formData.alternatives.split("\n").map((a) => a.trim()).filter(Boolean),
        consequences: formData.consequences || undefined,
        subsystemId: formData.subsystemId || undefined,
        relatedTaskIds: formData.relatedTaskIds.split("\n").map((a) => a.trim()).filter(Boolean),
      });
      setShowCreateDialog(false);
      setFormData({
        title: "",
        context: "",
        decision: "",
        rationale: "",
        alternatives: "",
        consequences: "",
        subsystemId: "",
        relatedTaskIds: "",
        status: "PROPOSED",
      });
      await refetch();
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleDecisionClick = (decision: any) => {
    setSelectedDecision(decision);
  };

  if (!actor) return null;

  return (
    <div className="space-y-6">
      <section className="section-dark grid-texture-dark rounded-[2rem] p-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-saffron">Institutional Memory</p>
            <h1 className="mt-2 text-3xl font-semibold">Decision Log (ADR)</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Architectural Decision Records for the team. Track context, rationale, and consequences so next year's leads inherit why, not just what.
            </p>
          </div>
          <Button
            className="gap-2 shrink-0"
            onClick={() => setShowCreateDialog(true)}
            disabled={createMutation.isPending}
          >
            <Plus className="size-4" />
            New Decision
          </Button>
        </div>
      </section>

      <section className="section-dark grid-texture-dark rounded-[2rem] p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search decisions..."
              className="input-field pl-10"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="select-field"
          >
            {statusOptions.map((option) => (
              <option key={option} value={option} className="bg-panel text-text">
                {option}
              </option>
            ))}
          </select>

          <select
            value={subsystemFilter}
            onChange={(e) => setSubsystemFilter(e.target.value)}
            className="select-field"
          >
            <option value="ALL" className="bg-panel text-text">All Subsystems</option>
            {subsystemData.map((subsystem) => (
              <option key={subsystem.id} value={subsystem.id} className="bg-panel text-text">
                {subsystem.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <DecisionList
        decisions={filteredDecisions}
        onSelect={handleDecisionClick}
        isLoading={isLoading}
      />

      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-modal rounded-[1.6rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="section-light grid-texture-light rounded-[1.6rem] p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-admin-ink">New Decision Record</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateDialog(false)}>
                  <X className="size-4" />
                </Button>
              </div>
              <form onSubmit={handleCreateSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="label-field-light">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="e.g., Switch from REST to gRPC for inter-service communication"
                    className="input-field-light"
                    required
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="label-field-light">Subsystem</label>
                    <select
                      value={formData.subsystemId}
                      onChange={(e) => setFormData({ ...formData, subsystemId: e.target.value })}
                      className="select-field-light"
                    >
                      <option value="" className="bg-paper-highlight text-admin-ink">None</option>
                      {subsystemData.map((s) => (
                        <option key={s.id} value={s.id} className="bg-paper-highlight text-admin-ink">
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label-field-light">Status</label>
                    <select
                      value={formData.status || "PROPOSED"}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="select-field-light"
                    >
                      <option value="PROPOSED" className="bg-paper-highlight text-admin-ink">Proposed</option>
                      <option value="ACCEPTED" className="bg-paper-highlight text-admin-ink">Accepted</option>
                      <option value="REJECTED" className="bg-paper-highlight text-admin-ink">Rejected</option>
                      <option value="DEFERRED" className="bg-paper-highlight text-admin-ink">Deferred</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="label-field-light">Context</label>
                  <textarea
                    value={formData.context}
                    onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                    placeholder="What is the problem or situation that led to this decision?"
                    rows={3}
                    className="input-field-light resize-none"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="label-field-light">Decision</label>
                  <textarea
                    value={formData.decision}
                    onChange={(e) => setFormData({ ...formData, decision: e.target.value })}
                    placeholder="What was decided?"
                    rows={3}
                    className="input-field-light resize-none"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="label-field-light">Rationale</label>
                  <textarea
                    value={formData.rationale}
                    onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                    placeholder="Why was this decision made? What evidence supports it?"
                    rows={3}
                    className="input-field-light resize-none"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="label-field-light">Alternatives Considered (one per line)</label>
                  <textarea
                    value={formData.alternatives}
                    onChange={(e) => setFormData({ ...formData, alternatives: e.target.value })}
                    placeholder="Option A: ...\nOption B: ..."
                    rows={3}
                    className="input-field-light resize-none font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="label-field-light">Consequences (optional)</label>
                  <textarea
                    value={formData.consequences}
                    onChange={(e) => setFormData({ ...formData, consequences: e.target.value })}
                    placeholder="What are the implications? Positive and negative."
                    rows={2}
                    className="input-field-light resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="label-field-light">Related Task IDs (one per line, optional)</label>
                  <textarea
                    value={formData.relatedTaskIds}
                    onChange={(e) => setFormData({ ...formData, relatedTaskIds: e.target.value })}
                    placeholder="task-abc123\ntask-def456"
                    rows={2}
                    className="input-field-light resize-none font-mono text-sm"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-steel/20">
                  <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateSubmit} disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Create Decision"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selectedDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-modal rounded-[1.6rem] w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="section-light grid-texture-light rounded-[1.6rem] p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-admin-ink">{selectedDecision.title}</h2>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDecision(null)}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full",
                    (() => {
                      const config: Record<DecisionStatus, string> = {
                        PROPOSED: "text-ice bg-ice/10",
                        ACCEPTED: "text-emerald-400 bg-emerald-400/10",
                        REJECTED: "text-red-400 bg-red-400/10",
                        SUPERSEDED: "text-saffron bg-saffron/10",
                        DEFERRED: "text-muted bg-white/10",
                      };
                      return config[selectedDecision.status as DecisionStatus];
                    })()
                  )}>
                    {selectedDecision.status}
                  </span>
                  {selectedDecision.subsystem && (
                    <span className="text-xs px-2 py-1 rounded-full bg-steel/20 text-secondary-ink">
                      {selectedDecision.subsystem.name}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-secondary-ink mb-1">Context</p>
                    <p className="text-sm text-admin-ink">{selectedDecision.context}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-secondary-ink mb-1">Decision</p>
                    <p className="text-sm text-admin-ink">{selectedDecision.decision}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-secondary-ink mb-1">Rationale</p>
                    <p className="text-sm text-admin-ink">{selectedDecision.rationale}</p>
                  </div>
                  {selectedDecision.alternatives.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-secondary-ink mb-2">Alternatives Considered</p>
                      <ul className="space-y-1 ml-4 list-disc text-sm text-admin-ink">
                        {selectedDecision.alternatives.map((alt: string, i: number) => (
                          <li key={i}>{alt}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedDecision.consequences && (
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-secondary-ink mb-1">Consequences</p>
                      <p className="text-sm text-admin-ink">{selectedDecision.consequences}</p>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-secondary-ink pt-4 border-t border-steel/20">
                    <span>By {selectedDecision.author.name}</span>
                    <span>{new Date(selectedDecision.createdAt).toLocaleDateString()}</span>
                    {selectedDecision.decidedAt && (
                      <span>Decided: {new Date(selectedDecision.decidedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-steel/20 flex justify-end">
                <Button variant="outline" onClick={() => setSelectedDecision(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}