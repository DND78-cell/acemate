import type { ReactNode } from "react";
import { AlertCircle, Info } from "lucide-react";
import { AceMateOrb } from "@/components/ai/AceMateOrb";

/** A calm message panel: a small icon and a clear sentence, never a red box. */
export function Notice({
  tone = "error",
  children,
  action,
  className = "",
}: {
  tone?: "error" | "info";
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = tone === "error" ? AlertCircle : Info;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`notice ${className}`}>
      <Icon
        className={`mt-0.5 h-[17px] w-[17px] shrink-0 ${tone === "error" ? "text-[var(--soft-danger)]" : "text-[var(--accent-2)]"}`}
        strokeWidth={1.7}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 text-[14px] leading-relaxed">{children}</div>
      {action}
    </div>
  );
}

/** An empty place in the study space: a tiny orb and a line or two. */
export function EmptyState({
  title = "Ready when you are.",
  subtitle = "Ask AceMate anything.",
  size = 34,
  className = "",
}: {
  title?: string;
  subtitle?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 text-center ${className}`}>
      <AceMateOrb activity="idle" size={size} showLabel={false} label={title} />
      <p className="mt-6 text-[16px] font-medium text-[var(--fg)]">{title}</p>
      {subtitle && <p className="mt-1.5 max-w-[34ch] text-[14px] leading-relaxed text-[var(--fg-muted)]">{subtitle}</p>}
    </div>
  );
}
