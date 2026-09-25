import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUp, Check, ChevronDown, Mic, Square } from "lucide-react";
import { dictationSupported, useDictation } from "@/lib/dictation";
import {
  EFFORT_OPTIONS,
  MODEL_OPTIONS,
  effortLabel,
  modelLabel,
  type EffortMode,
  type ModelId,
} from "@/lib/settings";

/**
 * The command bar: a floating glass container with the message on top and
 * controls along the bottom edge (attachments and modes on the left; model,
 * voice and send on the right).
 */
export function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  canSend,
  placeholder,
  inputRef,
  top,
  leading,
  trailing,
  autoFocus,
  voice = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  busy: boolean;
  canSend: boolean;
  placeholder: string;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  top?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  autoFocus?: boolean;
  /** Offer voice typing where the browser supports it. */
  voice?: boolean;
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;
  const valueRef = useRef(value);
  valueRef.current = value;
  const [canDictate] = useState(() => voice && dictationSupported());
  const dictation = useDictation((text) => {
    const current = valueRef.current;
    onChange(current.trim() ? `${current.replace(/\s+$/, "")} ${text}` : text);
    ref.current?.focus();
  });

  // Grow with the text up to a limit, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 208)}px`;
  }, [value, ref]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus, ref]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
      className="glass-panel command-bar"
    >
      {top}
      <textarea
        ref={ref}
        id="composer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy) onSubmit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        aria-label={placeholder}
        className="command-input scrollbar-thin block max-h-[208px] min-h-[26px] w-full resize-none bg-transparent px-1 outline-none focus-visible:outline-none"
      />
      {dictation.error && (
        <p role="status" className="fade-in px-1 pt-1 text-[12.5px] text-[var(--fg-muted)]">
          {dictation.error}
        </p>
      )}
      <div className="mt-2 flex items-center gap-1">
        {leading}
        <div className="flex-1" />
        {trailing}
        {canDictate && (
          <button
            type="button"
            onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
            disabled={busy}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? "Stop listening" : "Speak your question"}
            title={dictation.listening ? "Stop listening" : "Speak"}
            className={`round-btn ${dictation.listening ? "mic-on" : ""}`}
          >
            <Mic className="h-[18px] w-[18px]" strokeWidth={1.6} />
          </button>
        )}
        {busy && onStop ? (
          <button type="button" onClick={onStop} aria-label="Stop answering" title="Stop" className="round-btn stop-btn">
            <Square className="h-3 w-3" fill="currentColor" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            title={canSend ? "Send" : "Type a message to send"}
            aria-disabled={!canSend}
            onClick={(e) => {
              // Always answers the pointer; with nothing to send it just
              // puts you in the message box.
              if (!canSend) {
                e.preventDefault();
                ref.current?.focus();
              }
            }}
            className="round-btn send-btn"
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        )}
      </div>
    </form>
  );
}

/** Two-way switch inside the composer, e.g. Chat | Code. */
export function ModeToggle<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" className="inline-flex h-8 items-center rounded-full border border-[var(--line)] p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`h-full rounded-full px-3 text-[12.5px] transition-colors duration-200 ${
              active
                ? "bg-[var(--glass-strong)] text-[var(--fg)] shadow-[inset_0_0_0_1px_var(--line)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

function MenuOption({
  label,
  desc,
  active,
  onClick,
}: {
  label: string;
  desc: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left transition-colors duration-200 hover:bg-[var(--surface-hover)]"
    >
      <span className="flex-1">
        <span className="block text-[14px] text-[var(--fg)]">{label}</span>
        <span className="mt-0.5 block text-[12.5px] text-[var(--fg-muted)]">{desc}</span>
      </span>
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {active && <Check className="h-4 w-4 text-[var(--accent-ink)]" strokeWidth={2} />}
      </span>
    </button>
  );
}

/**
 * Model picker in the composer: shows "Ace One 4  Balanced" and opens one
 * menu for the model and, when `effort` is given, the effort level.
 */
export function ModelMenu({
  model,
  onModel,
  effort,
  onEffort,
  placement = "up",
}: {
  model: ModelId;
  onModel: (m: ModelId) => void;
  effort?: EffortMode;
  onEffort?: (e: EffortMode) => void;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] text-[var(--fg)] transition-colors duration-200 hover:bg-[var(--surface-hover)]"
      >
        <span>{modelLabel(model)}</span>
        {effort && <span className="hidden text-[var(--fg-muted)] min-[440px]:inline">{effortLabel(effort)}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--fg-muted)]" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className={`popover absolute right-0 z-30 w-[280px] p-1.5 ${
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="section-label px-3 pb-1 pt-1.5">Model</div>
          {MODEL_OPTIONS.map((opt) => (
            <MenuOption
              key={opt.value}
              label={opt.label}
              desc={opt.desc}
              active={opt.value === model}
              onClick={() => {
                onModel(opt.value);
                if (!effort) setOpen(false);
              }}
            />
          ))}
          {effort && onEffort && (
            <>
              <div className="mx-2 my-1.5 border-t border-[var(--line)]" />
              <div className="section-label px-3 pb-1 pt-1">Effort</div>
              {EFFORT_OPTIONS.map((opt) => (
                <MenuOption
                  key={opt.value}
                  label={opt.label}
                  desc={opt.desc}
                  active={opt.value === effort}
                  onClick={() => {
                    onEffort(opt.value);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
