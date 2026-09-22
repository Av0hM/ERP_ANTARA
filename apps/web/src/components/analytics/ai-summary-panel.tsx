"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAiSummary } from "@/hooks/use-operations";

export function AiSummaryPanel() {
  const { summarize, isSummarizing } = useAiSummary();
  const [context, setContext] = useState("Subsystem meeting");
  const [text, setText] = useState(
    "Telemetry validation found a retry edge case during HIL testing. Firmware needs one more pass on packet recovery before the avionics review.",
  );
  const [summary, setSummary] = useState<string | null>(null);
  const [source, setSource] = useState<"openai" | "local" | null>(null);

  const handleSummarize = async () => {
    const result = await summarize({ text, context });
    setSummary(result.summary);
    setSource(result.source);
  };

  return (
    <div className="section-dark grid-texture-dark rounded-[1.25rem] p-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl bg-saffron/10 text-saffron">
          <Sparkles className="size-5" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-saffron">AI Summarization</p>
          <h2 className="text-xl font-semibold">Turn technical notes into mission-ready summaries</h2>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="mb-2 block text-sm text-muted">Context</span>
          <input
            value={context}
            onChange={(event) => setContext(event.target.value)}
            className="input-field"
            placeholder="Design review, lab notes, subsystem sync..."
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-muted">Technical text</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={6}
            className="input-field resize-none"
            placeholder="Paste meeting notes, a discussion summary, or a technical update..."
          />
        </label>

        <Button className="w-full gap-2" onClick={() => void handleSummarize()} disabled={isSummarizing}>
          {isSummarizing ? <Loader2 className="size-4 animate-spin" /> : null}
          {isSummarizing ? "Summarizing..." : "Generate Summary"}
        </Button>

        {summary ? (
          <div className="rounded-xl border border-steel/30 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-[0.2em] text-saffron">Summary</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{source === "openai" ? "OpenAI" : "Local"}</p>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">{summary}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}