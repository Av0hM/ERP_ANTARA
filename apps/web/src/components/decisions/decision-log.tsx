"use client";

import { useState } from "react";
import { FileText, ChevronRight, ChevronDown, Clock, CheckCircle, XCircle, AlertCircle, PauseCircle, ArrowRight, Link } from "lucide-react";

import { DecisionRecord, DecisionStatus } from "@antara/contracts";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const statusConfig: Record<DecisionStatus, { label: string; color: string; icon: typeof CheckCircle }> = {
  PROPOSED: { label: "Proposed", color: "text-ice bg-ice/10", icon: PauseCircle },
  ACCEPTED: { label: "Accepted", color: "text-emerald-400 bg-emerald-400/10", icon: CheckCircle },
  REJECTED: { label: "Rejected", color: "text-red-400 bg-red-400/10", icon: XCircle },
  SUPERSEDED: { label: "Superseded", color: "text-saffron bg-saffron/10", icon: AlertCircle },
  DEFERRED: { label: "Deferred", color: "text-slate-400 bg-slate-400/10", icon: Clock },
};

interface DecisionCardProps {
  decision: DecisionRecord;
  onClick: () => void;
}

export function DecisionCard({ decision: decisionData, onClick }: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { status, title, context, decision, rationale, alternatives, consequences, author, subsystem, createdAt, updatedAt, supersededBy, supersedes } = decisionData;
  const config = statusConfig[status];

  return (
    <article
      className={cn(
        "card-dark rounded-xl border border-steel/30 p-5 transition-all cursor-pointer",
        "hover:border-saffron/30",
        expanded && "ring-2 ring-saffron/30",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3">
            <span className={cn("text-xs font-medium px-2 py-1 rounded-full", config.color)}>
              <config.icon className="size-3 mr-1" />
              {config.label}
            </span>
            {subsystem && (
              <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-muted">
                {subsystem.name}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-text truncate">{title}</h3>
          <p className="mt-2 text-sm text-muted line-clamp-2">{context}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1">
              <FileText className="size-3" />
              By {author.name}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className={cn(expanded && "text-saffron")}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-5 pt-5 border-t border-steel/20 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Decision</p>
              <p className="text-sm text-text">{decisionData.decision}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Rationale</p>
              <p className="text-sm text-text">{rationale}</p>
            </div>
          </div>

          {alternatives.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted mb-2">Alternatives Considered</p>
              <ul className="space-y-1 ml-4 list-disc text-sm text-text">
                {alternatives.map((alt: string, i: number) => (
                  <li key={i}>{alt}</li>
                ))}
              </ul>
            </div>
          )}

          {consequences && (
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Consequences</p>
              <p className="text-sm text-text">{consequences}</p>
            </div>
          )}

          {(supersededBy || supersedes) && (
            <div className="flex items-center gap-2 text-sm text-muted">
              {supersedes && (
                <span className="flex items-center gap-1">
                  <ArrowRight className="size-3" />
                  Supersedes: {supersedes.title} ({supersedes.status})
                </span>
              )}
              {supersededBy && (
                <span className="flex items-center gap-1">
                  Superseded by: {supersededBy.title} ({supersededBy.status})
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-steel/20">
            <span>Created: {new Date(decisionData.createdAt).toLocaleString()}</span>
            {decisionData.decidedAt && (
              <span>Decided: {new Date(decisionData.decidedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

interface DecisionListProps {
  decisions: DecisionRecord[];
  onSelect: (decision: DecisionRecord) => void;
  selectedId?: string;
  isLoading?: boolean;
}

export function DecisionList({ decisions, onSelect, selectedId, isLoading }: DecisionListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card-dark rounded-xl border border-steel/30 p-5 animate-pulse">
            <div className="h-6 w-48 bg-white/10 rounded-xl mb-3" />
            <div className="h-4 w-64 bg-white/10 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (decisions.length === 0) {
    return (
      <div className="section-dark grid-texture-dark rounded-xl border border-dashed border-steel/30 p-8 text-center text-muted">
        <FileText className="size-12 mx-auto mb-3 opacity-30" />
        <p>No decisions recorded yet</p>
        <p className="mt-1 text-sm">Create your first ADR to start building institutional memory</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {decisions.map((decision) => (
        <DecisionCard
          key={decision.id}
          decision={decision}
          onClick={() => onSelect(decision)}
        />
      ))}
    </div>
  );
}