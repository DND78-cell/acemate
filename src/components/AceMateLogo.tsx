type Props = {
  size?: number;
  className?: string;
};

/** AceMate's mark: a white "A" on a blue rounded square. `size` is its width and height in px. */
export function AceMateLogo({ size = 32, className }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      role="img"
      aria-label="AceMate"
      width={size}
      height={size}
      style={{ width: size, height: size, flexShrink: 0 }}
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M16 7 L24.5 25 H20.9 L19.2 21.2 H12.8 L11.1 25 H7.5 Z M14.1 18.2 H17.9 L16 13.8 Z"
        fill="#fff"
        fillRule="evenodd"
      />
    </svg>
  );
}
