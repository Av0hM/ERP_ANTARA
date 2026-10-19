"use client";
import { useEffect, useState } from "react";
import { classifyError, safeDiagnostics } from "@/lib/ux-error";
import { Button } from "./button";

type State =
  "idle" | "loading" | "saving" | "success" | "warning" | "error" | "retrying";
export function OperationFeedback({
  state,
  error,
  message,
  preserved = false,
  onRetry,
  page = "ANTARA ERP",
}: {
  state: State;
  error?: unknown;
  message?: string;
  preserved?: boolean;
  onRetry?: () => void;
  page?: Parameters<typeof safeDiagnostics>[1];
}) {
  const [copied, setCopied] = useState("");
  const [delayed, setDelayed] = useState(false);
  const busy =
    state === "loading" || state === "saving" || state === "retrying";
  useEffect(() => {
    setDelayed(false);
    if (!busy) return;
    const timer = setTimeout(() => setDelayed(true), 10_000);
    return () => clearTimeout(timer);
  }, [busy, state]);
  if (state === "idle") return null;
  const failure = state === "error" ? classifyError(error) : undefined;
  const label = {
    idle: "",
    loading: "Loading…",
    saving: "Saving…",
    success: "Saved",
    warning: "Needs attention",
    error: "Could not complete request",
    retrying: "Trying again…",
  }[state];
  return (
    <div
      role={failure ? "alert" : "status"}
      className="my-4 rounded-xl border border-steel/30 p-4 text-sm"
    >
      <p className="font-semibold">{failure?.title ?? label}</p>
      <p className="mt-1 text-muted">{message ?? failure?.message}</p>
      {busy && delayed && (
        <p className="mt-2">
          Still working. This is taking longer than expected. Please wait before
          submitting again.
        </p>
      )}
      {preserved && <p className="mt-1">Your changes are still here.</p>}
      {failure && <p className="mt-1">{failure.action}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {failure?.retryable && onRetry && (
          <Button type="button" onClick={onRetry}>
            Retry
          </Button>
        )}
        {failure && (
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  safeDiagnostics(failure, page),
                );
                setCopied("Diagnostics copied");
              } catch {
                setCopied(
                  "Clipboard unavailable. Share the error code: " +
                    failure.code,
                );
              }
            }}
          >
            Copy diagnostics
          </Button>
        )}
      </div>
      {copied && <p role="status">{copied}</p>}
    </div>
  );
}
