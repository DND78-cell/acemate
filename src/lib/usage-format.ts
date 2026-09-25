import type { UsageLimit } from "@/platform/types";

/** A limit as it stands now: a window whose reset time has passed starts over. */
export function liveLimit(limit: UsageLimit, now = Date.now()): UsageLimit {
  if (limit.resetsAt && Date.parse(limit.resetsAt) <= now) return { ...limit, used: 0, resetsAt: null };
  return limit;
}

export function percent(used: number, limit: number): number {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

/** "in 42 min", "in 3 hr 8 min", or "Thu 11:30 AM" for a day or more away. */
export function resetPhrase(at: number, now = Date.now()): string {
  const mins = Math.ceil((at - now) / 60_000);
  if (mins <= 1) return "in a minute";
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `in ${h} hr ${m} min` : `in ${h} hr`;
  }
  return new Date(at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** 950, 23.4k, 60k, 1.2M. */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${Number((n / 1000).toFixed(1))}k`;
  return `${Number((n / 1_000_000).toFixed(1))}M`;
}
