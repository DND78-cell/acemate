import { memo, type CSSProperties } from "react";

/** A few particles drifting very slowly: position (%), travel (px), duration (s). */
const DUST = [
  { x: 14, y: 22, dx: 70, dy: -40, dur: 90, delay: -12 },
  { x: 72, y: 16, dx: -60, dy: 50, dur: 110, delay: -40 },
  { x: 86, y: 64, dx: -80, dy: -30, dur: 95, delay: -65 },
  { x: 38, y: 78, dx: 60, dy: -60, dur: 120, delay: -20 },
  { x: 56, y: 40, dx: 50, dy: 40, dur: 130, delay: -80 },
  { x: 24, y: 52, dx: -40, dy: 70, dur: 105, delay: -55 },
];

/**
 * The deep-space backdrop behind everything: soft nebula light, a fine
 * starfield and a handful of drifting particles. All CSS; it never
 * re-renders after the first paint.
 */
export const SpaceBackground = memo(function SpaceBackground({ compact }: { compact: boolean }) {
  const dust = compact ? DUST.slice(0, 4) : DUST;
  return (
    <div className="space" aria-hidden="true">
      <div className="space-stars" />
      {dust.map((d, i) => (
        <span
          key={i}
          className="space-dust"
          style={
            {
              left: `${d.x}%`,
              top: `${d.y}%`,
              "--dx": `${d.dx}px`,
              "--dy": `${d.dy}px`,
              "--dur": `${d.dur}s`,
              "--delay": `${d.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
});
