import { useEffect, useState } from "react";

export type ResponseStyle = "concise" | "balanced" | "detailed";
export type TextSize = "small" | "medium" | "large";
export type Theme = "graphite" | "ocean" | "chalk" | "light";
export type ModelId = "aceOne" | "aceUltra";
export type EffortMode = "quick" | "balanced" | "max";

export type Settings = {
  responseStyle: ResponseStyle;
  textSize: TextSize;
  theme: Theme;
  model: ModelId;
  effort: EffortMode;
  codeMode: boolean;
};

const KEY = "acemate.settings.v1";
// v2: the redesign starts everyone on Graphite; later choices are kept.
export const THEME_KEY = "acemate-theme-v2";

const DEFAULTS: Settings = {
  responseStyle: "balanced",
  textSize: "medium",
  theme: "graphite",
  model: "aceOne",
  effort: "balanced",
  codeMode: false,
};

export const MODEL_OPTIONS: { value: ModelId; label: string; desc: string }[] = [
  { value: "aceOne", label: "Ace One 4", desc: "Fast everyday answers" },
  { value: "aceUltra", label: "Ace Ultra 4.8", desc: "Deeper reasoning for hard problems" },
];

export const EFFORT_OPTIONS: { value: EffortMode; label: string; desc: string }[] = [
  { value: "quick", label: "Quick", desc: "Fast, direct answers" },
  { value: "balanced", label: "Balanced", desc: "A good mix of speed and depth" },
  { value: "max", label: "Max", desc: "Slow, careful step-by-step reasoning" },
];

export function modelLabel(id: ModelId): string {
  return MODEL_OPTIONS.find((o) => o.value === id)?.label ?? "Ace One 4";
}

export function effortLabel(id: EffortMode): string {
  return EFFORT_OPTIONS.find((o) => o.value === id)?.label ?? "Balanced";
}

function isModelId(v: unknown): v is ModelId {
  return v === "aceOne" || v === "aceUltra";
}
function isEffort(v: unknown): v is EffortMode {
  return v === "quick" || v === "balanced" || v === "max";
}

function isTheme(v: unknown): v is Theme {
  return v === "graphite" || v === "ocean" || v === "chalk" || v === "light";
}

// "Warm" became "Chalkboard" in the exercise-book redesign.
const renamedTheme = (v: string | null) => (v === "warm" ? "chalk" : v);

function read(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw
      ? (JSON.parse(raw) as Partial<Settings> & { model?: unknown; effort?: unknown })
      : {};
    const savedTheme = renamedTheme(window.localStorage.getItem(THEME_KEY));
    return {
      responseStyle:
        parsed.responseStyle === "concise" ||
        parsed.responseStyle === "detailed" ||
        parsed.responseStyle === "balanced"
          ? parsed.responseStyle
          : DEFAULTS.responseStyle,
      textSize:
        parsed.textSize === "small" ||
        parsed.textSize === "large" ||
        parsed.textSize === "medium"
          ? parsed.textSize
          : DEFAULTS.textSize,
      theme: isTheme(savedTheme) ? savedTheme : DEFAULTS.theme,
      model: isModelId(parsed.model) ? parsed.model : DEFAULTS.model,
      effort: isEffort(parsed.effort) ? parsed.effort : DEFAULTS.effort,
      codeMode:
        typeof parsed.codeMode === "boolean"
          ? parsed.codeMode
          : DEFAULTS.codeMode,
    };
  } catch {
    return DEFAULTS;
  }
}

const listeners = new Set<(s: Settings) => void>();
let current: Settings | null = null;

function getCurrent(): Settings {
  if (current == null) current = read();
  return current;
}

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [state, setState] = useState<Settings>(() => getCurrent());

  useEffect(() => {
    const listener = (s: Settings) => setState(s);
    listeners.add(listener);
    setState(getCurrent());
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const update = (patch: Partial<Settings>) => {
    const next = { ...getCurrent(), ...patch };
    current = next;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
        if (patch.theme) window.localStorage.setItem(THEME_KEY, next.theme);
      } catch {
        /* ignore */
      }
    }
    listeners.forEach((l) => l(next));
  };

  return [state, update];
}

export const TEXT_SIZE_PX: Record<TextSize, number> = {
  small: 14,
  medium: 15,
  large: 17,
};

// Settings → "Clear conversation" hands off to the chat screen. The app is a
// single page now, so an in-memory flag carries it across the navigation.
let clearRequested = false;

export function requestClearConversation() {
  clearRequested = true;
}

export function consumeClearConversation(): boolean {
  const v = clearRequested;
  clearRequested = false;
  return v;
}
