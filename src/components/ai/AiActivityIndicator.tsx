import { AI_ACTIVITY_LABEL, type AiActivity } from "./aiActivity";

/** Three dots, and optionally a line saying what AceMate is doing. */
export function AiActivityIndicator({
  activity,
  centered = false,
  className = "",
  showLabel = true,
}: {
  activity: AiActivity;
  /** Larger dots over the label, for a whole-screen wait. */
  centered?: boolean;
  className?: string;
  showLabel?: boolean;
}) {
  const label = AI_ACTIVITY_LABEL[activity];
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={showLabel ? undefined : label}
      className={`inline-flex items-center ${centered ? "flex-col gap-4" : "gap-2.5"} ${className}`}
    >
      <span className={`dots ${centered ? "dots-lg" : ""}`} aria-hidden="true">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </span>
      {showLabel && <span className="text-[13px] text-[var(--fg-muted)]">{label}</span>}
    </div>
  );
}
