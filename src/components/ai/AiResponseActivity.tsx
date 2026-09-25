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
  return reasoning.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "Working it out…";
}

function ReasoningDetails({ text }: { text: string }) {
  return (
    <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap border-l border-[var(--line-strong)] pl-3 text-xs leading-relaxed text-[color:var(--ice-dim)]">
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
        <span className="min-w-0 flex-1 truncate">{reasoning ? latestReasoningLine(reasoning) : "Working it out…"}</span>
        <span className="shrink-0 tabular-nums">{elapsed}s</span>
        {reasoning && (
          <button
            type="button"
            aria-label={open ? "Hide working" : "Show working"}
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
  const time = <span className="tabular-nums text-[var(--fg-faint)]">{seconds}s</span>;

  if (!reasoning) {
    return <div className="mb-1.5 text-xs text-[color:var(--ice-dim)]">Worked out in {time}</div>;
  }

  return (
    <div className="mb-1.5 text-xs text-[color:var(--ice-dim)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-[var(--fg)]"
      >
        <span>{open ? "Hide working" : "Show working"}</span>
        <span aria-hidden="true">·</span>
        {time}
        <span className={`text-base leading-none transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && <ReasoningDetails text={reasoning} />}
    </div>
  );
}
