export type AiActivity = "thinking" | "writing" | "reading" | "building";

/** What AceMate says it's doing, for each thing it actually does. */
export const AI_ACTIVITY_LABEL: Record<AiActivity, string> = {
  thinking: "Thinking…",
  writing: "Writing…",
  reading: "Reading your pages…",
  building: "Building your page…",
};
