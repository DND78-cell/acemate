import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AceMateLogo } from "@/components/AceMateLogo";
import { AiActivityIndicator } from "./AiActivityIndicator";

/** The small name line over each of AceMate's answers. */
export function AnswerHeader() {
  return (
    <div className="mb-2 flex items-center gap-2 text-[13.5px] font-semibold text-[var(--fg)]">
      <AceMateLogo size={20} />
      AceMate
    </div>
  );
}

export function reasoningText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === "reasoning" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export function messageText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "")
    .join("");
}

function latestReasoningLine(reasoning: string): string {
  return reasoning.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "Thinking…";
}

function ReasoningDetails({ text }: { text: string }) {
  return (
    <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap border-l-2 border-[var(--line-strong)] pl-3 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
      {text}
    </div>
  );
}

export function ThinkingActivity({
  startedAt,
  reasoning,
}: {
  startedAt: number;
  reasoning: string;
}) {
  const [elapsed, setElapsed] = useState(() => Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  return (
    <div role="status" aria-live="polite" className="w-full">
      <AnswerHeader />
      <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-[var(--fg-muted)]">
        <AiActivityIndicator activity="thinking" showLabel={false} />
        <span className="min-w-0 flex-1 truncate">{reasoning ? latestReasoningLine(reasoning) : "Thinking…"}</span>
        <span className="shrink-0 tabular-nums text-[var(--fg-faint)]">{elapsed}s</span>
        {reasoning && (
          <button
            type="button"
            aria-label={open ? "Hide reasoning" : "Show reasoning"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        )}
      </div>
      {open && reasoning && <ReasoningDetails text={reasoning} />}
    </div>
  );
}

export function ThoughtDisclosure({
  seconds,
  reasoning,
}: {
  seconds: number;
  reasoning: string;
}) {
  const [open, setOpen] = useState(false);
  const time = <span className="tabular-nums">{seconds}s</span>;

  if (!reasoning) {
    return <div className="mb-2 text-[12.5px] text-[var(--fg-muted)]">Answered in {time}</div>;
  }

  return (
    <div className="mb-2 text-[12.5px] text-[var(--fg-muted)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md hover:text-[var(--fg)]"
      >
        {open ? "Hide reasoning" : "Show reasoning"} · {time}
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && <ReasoningDetails text={reasoning} />}
    </div>
  );
}