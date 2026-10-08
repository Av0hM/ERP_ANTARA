"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useShell } from "@/components/layout/app-shell";
import { useAiSummary } from "@/hooks/use-operations";
import { useActorProfile } from "@/hooks/use-actor-profile";
import {
  fetchAiJob,
  fetchAiJobs,
  fetchAiReadiness,
  submitAiInsights,
} from "@/lib/operations-api";

export function AiSummaryPanel() {
  const { summarize, isSummarizing } = useAiSummary();
  const actor = useActorProfile();
  const shell = useShell();
  const [submittingInsights, setSubmittingInsights] = useState(false);
  const cache = useQueryClient();
  const [context, setContext] = useState("");
  const [text, setText] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const health = useQuery({
    queryKey: ["ai-readiness", actor?.id],
    queryFn: () => fetchAiReadiness(actor?.accessToken),
    enabled: !!actor,
    refetchInterval: 60000,
    retry: false,
  });
  const history = useQuery({
    queryKey: ["ai-jobs", actor?.id],
    queryFn: () => fetchAiJobs(actor?.accessToken),
    enabled: !!actor,
    retry: false,
    refetchInterval: 60000,
  });
  const job = useQuery({
    queryKey: ["ai-job", actor?.id, jobId],
    queryFn: () => fetchAiJob(jobId!, actor?.accessToken),
    enabled: !!actor && !!jobId,
    retry: false,
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
        ? 5000
        : false,
  });
  useEffect(() => {
    if (["SUCCEEDED", "FAILED"].includes(job.data?.status ?? "")) {
      void cache.invalidateQueries({ queryKey: ["ai-jobs"] });
      void cache.invalidateQueries({ queryKey: ["notifications"] });
      void cache.invalidateQueries({ queryKey: ["ui-context"] });
    }
  }, [job.data?.status, cache]);
  const busy =
    submittingInsights ||
    isSummarizing ||
    ["QUEUED", "RUNNING"].includes(job.data?.status ?? "");
  const submit = async () => {
    setError("");
    setJobId(null);
    try {
      const result = await summarize({ text, context });
      cache.setQueryData(["ai-job", actor?.id, result.id], result);
      setJobId(result.id);
      void cache.invalidateQueries({ queryKey: ["ai-jobs"] });
    } catch {
      setError("AI submission is unavailable. Your notes have been preserved.");
    }
  };
  const analyze = async () => {
    setError("");
    setJobId(null);
    setSubmittingInsights(true);
    try {
      const result = await submitAiInsights(
        shell.current.subsystemId ?? undefined,
        actor?.accessToken,
      );
      cache.setQueryData(["ai-job", actor?.id, result.id], result);
      setJobId(result.id);
      void cache.invalidateQueries({ queryKey: ["ai-jobs"] });
    } catch {
      setError("Analysis is unavailable or your scope has changed.");
    } finally {
      setSubmittingInsights(false);
    }
  };
  return (
    <section
      className="section-dark grid-texture-dark rounded-[1.25rem] p-6"
      aria-label="AI summarization"
    >
      <h2 className="text-xl font-semibold">AI Summarization</h2>
      <p className="mt-2 text-sm text-muted">
        Optional advisory summaries. Review generated text before using it.
      </p>
      <p role="status" className="mt-3 text-sm">
        {health.isPending
          ? "Checking AI availability…"
          : health.isError
            ? "AI availability could not be checked"
            : health.data?.status === "disabled"
              ? "AI is disabled"
              : health.data?.status === "temporarily unavailable"
                ? "AI is temporarily unavailable; queued work has bounded retries"
                : "AI is available"}
      </p>
      <div className="mt-5 space-y-4">
        <label className="block">
          Context
          <input
            className="input-field"
            value={context}
            maxLength={500}
            onChange={(event) => setContext(event.target.value)}
          />
        </label>
        <label className="block">
          Technical text
          <textarea
            className="input-field"
            rows={6}
            maxLength={12000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste your technical notes"
          />
        </label>
        <Button
          onClick={() => void submit()}
          disabled={
            !text.trim() ||
            busy ||
            health.isPending ||
            health.isError ||
            health.data?.status === "disabled"
          }
        >
          {isSummarizing ? "Submitting…" : "Generate Summary"}
        </Button>
        {shell.current.canManage ? (
          <Button
            onClick={() => void analyze()}
            disabled={
              busy ||
              health.isPending ||
              health.isError ||
              health.data?.status === "disabled"
            }
          >
            Analyze authorized tasks
          </Button>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {job.isError ? (
          <p role="alert">
            This analysis is unavailable or your access has changed. No previous
            result is displayed.
          </p>
        ) : job.data ? (
          <div
            aria-live="polite"
            className="rounded-xl border border-steel/30 p-4"
          >
            <p>
              {job.data.status === "QUEUED"
                ? job.data.attempts
                  ? "Retry queued"
                  : "Queued"
                : job.data.status === "RUNNING"
                  ? "Running"
                  : job.data.status === "SUCCEEDED"
                    ? "Completed · Ollama"
                    : job.data.status === "CANCELLED"
                      ? "Cancelled"
                      : "Analysis failed. You may submit again."}
            </p>
            {job.data.status === "SUCCEEDED" && job.data.result ? (
              <p className="mt-3 whitespace-pre-wrap text-sm">
                {job.data.result.summary}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">No analysis requested.</p>
        )}
        <div className="space-y-2" aria-label="Recent AI requests">
          <p className="text-sm font-medium">Recent requests</p>
          {history.isError ? (
            <p>Request history is unavailable.</p>
          ) : history.isPending ? (
            <p>Loading requests…</p>
          ) : !history.data?.length ? (
            <p>No available requests.</p>
          ) : (
            history.data.slice(0, 5).map((item) => (
              <button
                key={item.id}
                className="block text-sm underline"
                onClick={() => setJobId(item.id)}
              >
                {item.operation === "SUMMARY" ? "Summary" : "Task analysis"} ·{" "}
                {item.status}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
