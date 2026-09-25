import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowUp, Check, ChevronDown, Square } from "lucide-react";
import {
  EFFORT_OPTIONS,
  MODEL_OPTIONS,
  effortLabel,
  modelLabel,
  type EffortMode,
  type ModelId,
} from "@/lib/settings";

/** The message box: text on top, controls along the bottom edge. */
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
}) {
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;

  // Grow with the text up to a limit, then scroll.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
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
      className="rounded-2xl border border-[var(--line-strong)] bg-[var(--surface)] px-3 pb-2.5 pt-3 transition-[border-color,box-shadow] focus-within:border-[var(--accent)] focus-within:ring-[3px] focus-within:ring-[var(--accent-soft)]"
      style={{ boxShadow: "var(--shadow-composer)" }}
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
        className="scrollbar-thin block max-h-[220px] min-h-[28px] w-full resize-none bg-transparent px-1.5 text-[15.5px] leading-7 text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)] focus-visible:outline-none"
      />
      <div className="mt-2 flex items-center gap-1.5">
        {leading}
        <div className="flex-1" />
        {trailing}
        {busy && onStop ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop answering"
            title="Stop"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--fg)] text-[var(--bg)] transition-opacity hover:opacity-85"
          >
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
              canSend
                ? "bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
                : "bg-[var(--surface-hover)] text-[var(--fg-faint)]"
            }`}
          >
            <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.25} />
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
    <div role="radiogroup" className="inline-flex h-8 items-center rounded-lg border border-[var(--line)] p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`h-full rounded-md px-2.5 text-[13px] transition-colors ${
              active
                ? "bg-[var(--accent-soft)] font-medium text-[var(--accent-ink)]"
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
      className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--surface-hover)]"
    >
      <span className="flex-1">
        <span className="block text-[14px] text-[var(--fg)]">{label}</span>
        <span className="mt-0.5 block text-[12.5px] text-[var(--fg-muted)]">{desc}</span>
      </span>
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        {active && <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={2} />}
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
        className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13.5px] text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)]"
      >
        <span>{modelLabel(model)}</span>
        {effort && <span className="hidden text-[var(--fg-muted)] min-[440px]:inline">{effortLabel(effort)}</span>}
        <ChevronDown className="h-3.5 w-3.5 text-[var(--fg-muted)]" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className={`popover absolute right-0 z-30 w-[272px] p-1.5 ${
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-[var(--fg-faint)]">Model</div>
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
              <div className="px-2.5 pb-1 pt-1 text-[12px] font-medium text-[var(--fg-faint)]">Effort</div>
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
