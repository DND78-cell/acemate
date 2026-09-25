export type AiActivity = "idle" | "thinking" | "writing" | "reading" | "building";

/** How the orb looks: resting, working something out, or producing output. */
export type OrbState = "idle" | "thinking" | "writing";

export interface AiActivityConfig {
  state: OrbState;
  label: string;
}

/** Single mapping from AceMate activity → orb state + label. */
export const AI_ACTIVITY: Record<AiActivity, AiActivityConfig> = {
  idle: { state: "idle", label: "Ready when you are." },
  thinking: { state: "thinking", label: "Thinking…" },
  writing: { state: "writing", label: "Building your answer…" },
  reading: { state: "thinking", label: "Creating your notes…" },
  building: { state: "writing", label: "Building your page…" },
};
