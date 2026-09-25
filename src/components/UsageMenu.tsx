import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useDismiss } from "@/hooks/use-dismiss";
import { refreshUsage, useUsage } from "@/lib/usage";
import { compactNumber, liveLimit, percent, resetPhrase } from "@/lib/usage-format";
import { requestSettingsView } from "@/lib/settings";
import { IS_WEB } from "@/platform";
import type { UsageLimit } from "@/platform/types";

export type ContextUse = { used: number; limit: number };

export const LIMIT_LABEL: Record<UsageLimit["id"], string> = {
  hour: "Hourly limit",
  week: "Weekly limit",
};

/** Amber from 80%, red when full. */
function levelColor(value: number, normal: string): string {
  if (value >= 100) return "var(--danger)";
  if (value >= 80) return "#f59e0b";
  return normal;
}

export function UsageBar({ value, label }: { value: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${value}%`, background: levelColor(value, "var(--fg)") }}
      />
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 7;
  const length = 2 * Math.PI * r;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      {value > 0 && (
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke={levelColor(value, "var(--fg-muted)")}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${(length * value) / 100} ${length}`}
          transform="rotate(-90 9 9)"
        />
      )}
    </svg>
  );
}

/** A clock for reset times that ticks while `active`. */
export function useNow(active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export function resetText(limit: UsageLimit, now: number): string {
  return limit.resetsAt ? `Resets ${resetPhrase(Date.parse(limit.resetsAt), now)}` : "Not used yet";
}

function contextNote({ used, limit }: ContextUse): string {
  if (used === 0) return "How much of this chat AceMate can keep in mind. It fills up as you talk.";
  if (used > limit) return "This chat is past the limit, so AceMate leaves out its oldest messages. Start a new chat to begin fresh.";
  return "How much of this chat AceMate keeps in mind. When it's full, the oldest messages are left out.";
}

/**
 * The ring beside the model picker. It fills with whichever is closest to
 * its limit (this chat's context or the hourly or weekly budget) and opens
 * a panel with each of them.
 */
export function UsageMenu({ context, placement = "up" }: { context: ContextUse; placement?: "up" | "down" }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const { report, loaded } = useUsage();
  const navigate = useNavigate();
  const now = useNow(open);

  useEffect(() => {
    if (open) void refreshUsage();
  }, [open]);

  const limits = (report?.limits ?? []).map((l) => liveLimit(l, now));
  const contextPct = percent(context.used, context.limit);
  const top = Math.max(contextPct, ...limits.map((l) => percent(l.used, l.limit)));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Usage: ${top}% used`}
        title="Usage"
        className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--surface-hover)]"
      >
        <Ring value={top} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Usage"
          className={`popover absolute right-0 z-30 w-[300px] max-w-[calc(100vw-24px)] p-4 text-left ${
            placement === "up" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13.5px] font-medium text-[var(--fg)]">Context window</span>
            <span className="shrink-0 text-[12.5px] tabular-nums text-[var(--fg-muted)]">
              {compactNumber(context.used)} / {compactNumber(context.limit)} ({contextPct}%)
            </span>
          </div>
          <UsageBar value={contextPct} label="Context window" />
          <p className="mt-2 text-[12px] leading-snug text-[var(--fg-faint)]">{contextNote(context)}</p>

          <div className="mt-4 border-t border-[var(--line)] pt-3">
            {!IS_WEB ? (
              <>
                <div className="text-[12.5px] font-medium text-[var(--fg-muted)]">Usage limits</div>
                <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--fg-faint)]">
                  On claude.ai, AceMate runs on your claude.ai plan, so its usage limits apply.
                </p>
              </>
            ) : !report ? (
              <p className="text-[12.5px] text-[var(--fg-faint)]">
                {loaded ? "Couldn't load your limits. Try again in a moment." : "Checking your limits…"}
              </p>
            ) : (
              <>
                <div className="text-[12.5px] font-medium text-[var(--fg-muted)]">
                  Usage limits · {report.plan === "guest" ? "Guest" : "Your account"}
                </div>
                {limits.map((l) => {
                  const pct = percent(l.used, l.limit);
                  return (
                    <div key={l.id} className="mt-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13.5px] font-medium text-[var(--fg)]">{LIMIT_LABEL[l.id]}</span>
                        <span className="shrink-0 text-[12.5px] text-[var(--fg-muted)]">
                          {resetText(l, now)}
                          <span className="ml-2 inline-block min-w-[2.6em] text-right tabular-nums">{pct}%</span>
                        </span>
                      </div>
                      <UsageBar value={pct} label={LIMIT_LABEL[l.id]} />
                    </div>
                  );
                })}
                {report.plan === "guest" && (
                  <p className="mt-3 text-[12.5px] text-[var(--fg-faint)]">
                    <Link to="/auth" onClick={() => setOpen(false)} className="text-[var(--fg)] underline underline-offset-2">
                      Sign in
                    </Link>{" "}
                    for higher limits.
                  </p>
                )}
              </>
            )}
          </div>

          {IS_WEB && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                requestSettingsView("usage");
                void navigate({ to: "/settings" });
              }}
              className="-mx-2 -mb-1 mt-3 flex w-[calc(100%+16px)] items-center justify-between rounded-lg px-2 py-2 text-[13px] text-[var(--fg)] transition-colors hover:bg-[var(--surface-hover)]"
            >
              See detailed breakdown
              <ChevronRight className="h-4 w-4 text-[var(--fg-muted)]" strokeWidth={1.75} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
