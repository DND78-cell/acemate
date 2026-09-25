import { useEffect, useState } from "react";
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
    <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap pl-7 text-xs leading-relaxed text-[color:var(--ice-dim)]">
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
    <div role="status" aria-live="polite" className="max-w-[92%] py-1 pl-1">
      <div className="flex min-w-0 items-center gap-2 text-xs text-[color:var(--ice-dim)]">
        <AceMateOrb activity="thinking" size={20} showLabel={false} />
        <span className="min-w-0 flex-1 truncate">{reasoning ? latestReasoningLine(reasoning) : "Thinking…"}</span>
        <span className="shrink-0 tabular-nums">{elapsed}s</span>
        {reasoning && (
          <button
            type="button"
            aria-label={open ? "Hide reasoning" : "Show reasoning"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center text-base transition-transform ${open ? "rotate-90" : ""}`}
          >
            ›
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
  const label = <span className="tabular-nums">Thought for {seconds}s</span>;

  if (!reasoning) {
    return <div className="mb-1 pl-1 text-xs text-[color:var(--ice-dim)]">{label}</div>;
  }

  return (
    <div className="mb-1 pl-1 text-xs text-[color:var(--ice-dim)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5"
      >
        {label}
        <span className={`text-base transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <ReasoningDetails text={reasoning} />}
    </div>
  );
}