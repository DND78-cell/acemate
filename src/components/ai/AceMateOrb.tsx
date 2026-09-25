import { useEffect, useRef, type CSSProperties } from "react";
import { AI_ACTIVITY, type AiActivity } from "./aiActivity";

const EMIT_ANGLES = [0, 60, 120, 180, 240, 300];

/**
 * AceMate's presence: a small energy core. It breathes slowly at rest;
 * while thinking it brightens, a ring and orbiting sparks appear; while
 * writing, sparks flow outward. Pure CSS, so it costs almost nothing.
 */
export function AceMateOrb({
  activity,
  size = 20,
  centered = false,
  className = "",
  showLabel = true,
  label,
  interactive = false,
}: {
  activity: AiActivity;
  size?: number;
  centered?: boolean;
  className?: string;
  showLabel?: boolean;
  /** Overrides the activity's own label. */
  label?: string;
  /** Lean gently toward the cursor (the large orb on the home screen). */
  interactive?: boolean;
}) {
  const cfg = AI_ACTIVITY[activity];
  const orbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = orbRef.current;
    if (!interactive || !el) return;
    let fine = false;
    let still = false;
    try {
      fine = window.matchMedia("(pointer: fine)").matches;
      still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      /* no media queries: stay put */
    }
    if (!fine || still) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const reach = 360;
        const dist = Math.hypot(dx, dy);
        const pull = Math.max(0, 1 - dist / reach);
        el.style.setProperty("--px", ((dx / reach) * pull).toFixed(3));
        el.style.setProperty("--py", ((dy / reach) * pull).toFixed(3));
        el.style.setProperty("--near", pull.toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, [interactive]);

  const text = label ?? cfg.label;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={showLabel ? undefined : text}
      className={`inline-flex items-center gap-3 ${centered ? "flex-col" : ""} ${className}`}
    >
      <div ref={orbRef} className="orb" data-state={cfg.state} style={{ "--s": `${size}px` } as CSSProperties} aria-hidden="true">
        <span className="orb-glow" />
        <span className="orb-ring" />
        <span className="orb-ring ripple" />
        <span className="orb-core" />
        <span className="orb-orbit" style={{ transform: "rotate(-22deg)" }}>
          <span className="ox" style={{ "--d": "2.6s" } as CSSProperties}>
            <span className="oy" style={{ "--d": "2.6s" } as CSSProperties}>
              <i />
            </span>
          </span>
        </span>
        <span className="orb-orbit" style={{ transform: "rotate(-22deg)" }}>
          <span className="ox" style={{ "--d": "2.6s", "--dl": "-1.3s" } as CSSProperties}>
            <span className="oy" style={{ "--d": "2.6s", "--dl": "-1.3s" } as CSSProperties}>
              <i />
            </span>
          </span>
        </span>
        <span className="orb-orbit" style={{ transform: "rotate(28deg)" }}>
          <span className="ox" style={{ "--d": "3.4s", "--dl": "-0.8s" } as CSSProperties}>
            <span className="oy" style={{ "--d": "3.4s", "--dl": "-0.8s" } as CSSProperties}>
              <i />
            </span>
          </span>
        </span>
        <span className="orb-emit">
          {EMIT_ANGLES.map((a, i) => (
            <i key={a} style={{ "--a": `${a}deg`, animationDelay: `${i * 0.3}s` } as CSSProperties} />
          ))}
        </span>
      </div>
      {showLabel && (
        <span key={text} className="fade-in text-[13px] text-[var(--fg-muted)]">
          {text}
        </span>
      )}
    </div>
  );
}
