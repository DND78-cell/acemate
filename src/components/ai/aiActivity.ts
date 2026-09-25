import type { OrbState } from "thinking-orbs";

export type AiActivity = "thinking" | "writing" | "reading" | "building";

export interface AiActivityConfig {
  state: OrbState;
  label: string;
}

/**
 * Single mapping from AceMate activity → thinking-orbs state + label.
 * Only activities AceMate actually performs.
 */
export const AI_ACTIVITY: Record<AiActivity, AiActivityConfig> = {
  thinking: { state: "working", label: "Thinking…" },
  writing: { state: "composing", label: "Writing…" },
  reading: { state: "working", label: "Reading your pages…" },
  building: { state: "shaping", label: "Building your page…" },
};
