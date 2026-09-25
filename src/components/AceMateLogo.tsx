import { useId } from "react";

type Props = {
  size?: number;
  /** Adds a soft violet halo (large uses such as About). */
  glow?: boolean;
  className?: string;
};

/**
 * AceMate's mark: a small core with its companion on an orbit. The same
 * geometry is the favicon (public/favicon.svg).
 */
export function AceMateLogo({ size = 24, glow = false, className }: Props) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="AceMate"
      width={size}
      height={size}
      className={className}
      style={glow ? { filter: "drop-shadow(0 0 18px rgba(139, 92, 246, 0.55))" } : undefined}
    >
      <defs>
        <radialGradient id={`core-${id}`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#EDE9FE" />
          <stop offset="0.35" stopColor="#A78BFA" />
          <stop offset="0.75" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#0EA5E9" />
        </radialGradient>
      </defs>
      <g transform="rotate(-24 16 16)">
        <ellipse cx="16" cy="16" rx="12.5" ry="4.6" fill="none" stroke="#A78BFA" strokeOpacity="0.45" strokeWidth="1.4" />
      </g>
      <circle cx="16" cy="16" r="6.4" fill={`url(#core-${id})`} />
      <g transform="rotate(-24 16 16)">
        <path
          d="M28.5 16 A12.5 4.6 0 0 1 3.5 16"
          fill="none"
          stroke="#C4B5FD"
          strokeOpacity="0.9"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <circle cx="26.24" cy="18.64" r="1.7" fill="#38BDF8" />
      </g>
    </svg>
  );
}
