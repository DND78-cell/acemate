import { ThinkingOrb, type OrbSize, type OrbTheme } from "thinking-orbs";
import { useSettings } from "@/lib/settings";
import { AI_ACTIVITY, type AiActivity } from "./aiActivity";

// Explicit theme mapping — the library's "auto" mode expects data-theme="dark"|"light",
// but AceMate uses "ocean" | "warm" | "light".
const ORB_THEME: Record<string, OrbTheme> = {
  graphite: "dark",
  ocean: "dark",
  warm: "dark",
  light: "light",
};

export function AceMateOrb({
  activity,
  size = 20,
  centered = false,
  className = "",
  showLabel = true,
}: {
  activity: AiActivity;
  size?: OrbSize;
  centered?: boolean;
  className?: string;
  showLabel?: boolean;
}) {
  const [settings] = useSettings();
  const cfg = AI_ACTIVITY[activity];
  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2.5 ${centered ? "flex-col" : ""} ${className}`}
    >
      <ThinkingOrb
        state={cfg.state}
        size={size}
        theme={ORB_THEME[settings.theme] ?? "dark"}
        aria-hidden="true"
      />
      {showLabel && (
        <span className="text-xs text-[color:var(--ice-dim)]">{cfg.label}</span>
      )}
    </div>
  );
}
