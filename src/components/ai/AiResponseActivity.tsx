import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AceMateOrb } from "./AceMateOrb";

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
    <div className="glass fade-in scrollbar-thin mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
      {text}
    </div>
  );
}

/** While AceMate works on an answer: the orb, what it's considering, and the time. */
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

  const line = reasoning ? latestReasoningLine(reasoning) : "Thinking…";
  return (
    <div role="status" aria-live="polite" className="msg-in w-full">
      <div className="flex min-w-0 items-center gap-3 text-[13.5px] text-[var(--fg-muted)]">
        <AceMateOrb activity="thinking" size={22} showLabel={false} />
        <span key={line} className="fade-in min-w-0 flex-1 truncate">
          {line}
        </span>
        <span className="shrink-0 tabular-nums text-[12.5px] text-[var(--fg-faint)]">{elapsed}s</span>
        {reasoning && (
          <button
            type="button"
            aria-label={open ? "Hide reasoning" : "Show reasoning"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="round-btn h-7 w-7"
          >
            <ChevronRight className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-90" : ""}`} strokeWidth={1.8} />
          </button>
        )}
      </div>
      {open && reasoning && <ReasoningDetails text={reasoning} />}
    </div>
  );
}

/** Under a finished answer's header: how long AceMate reasoned, and what it considered. */
export function ThoughtDisclosure({
  seconds,
  reasoning,
}: {
  seconds: number;
  reasoning: string;
}) {
  const [open, setOpen] = useState(false);
  const time = <span className="tabular-nums text-[var(--fg-faint)]">{seconds}s</span>;

  if (!reasoning) {
    return <div className="mb-2 text-[12.5px] text-[var(--fg-muted)]">Answered in {time}</div>;
  }

  return (
    <div className="mb-2 w-full text-[12.5px] text-[var(--fg-muted)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="-ml-1.5 inline-flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 transition-colors duration-200 hover:bg-[var(--surface-hover)] hover:text-[var(--fg)]"
      >
        <span>{open ? "Hide reasoning" : "Reasoning"}</span>
        <span aria-hidden="true">·</span>
        {time}
        <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} strokeWidth={1.8} />
      </button>
      {open && <ReasoningDetails text={reasoning} />}
    </div>
  );
}
