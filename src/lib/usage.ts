import { useEffect, useSyncExternalStore } from "react";
import { platform } from "@/platform";
import type { UsageReport } from "@/platform/types";

export type UsageState = {
  /** Null on claude.ai, and until the first report arrives. */
  report: UsageReport | null;
  /** Whether an answer (or a failure) has come back yet. */
  loaded: boolean;
};

// The caller's AI budgets, shared by every usage ring and Settings → Usage.
let state: UsageState = { report: null, loaded: false };
let inflight: Promise<void> | null = null;
let watchingViewer = false;
const listeners = new Set<() => void>();

/** Ask for fresh numbers; overlapping calls share one request. */
export function refreshUsage(): Promise<void> {
  inflight ??= platform
    .usage()
    .then(
      (report) => report,
      () => null,
    )
    .then((report) => {
      state = { report, loaded: true };
      inflight = null;
      listeners.forEach((l) => l());
    });
  return inflight;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!watchingViewer) {
    watchingViewer = true;
    // Signing in or out changes whose budgets these are.
    platform.onViewerChange(() => void refreshUsage());
  }
  return () => {
    listeners.delete(fn);
  };
}

const initial: UsageState = { report: null, loaded: false };

/** The latest usage report, fetched the first time anything asks. */
export function useUsage(): UsageState {
  const current = useSyncExternalStore(subscribe, () => state, () => initial);
  useEffect(() => {
    if (!state.loaded) void refreshUsage();
  }, []);
  return current;
}
