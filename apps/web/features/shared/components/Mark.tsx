export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      focusable={false}
      style={{ display: "block" }}
    >
      <title>nabit</title>
      <rect x="2" y="6" width="10" height="8" fill="currentColor" />
      <path d="M12 6 L18 4 L18 14 L12 12 Z" fill="currentColor" />
      <rect x="4" y="8" width="2" height="2" fill="var(--bg)" />
      <rect x="15" y="8" width="1.5" height="1.5" fill="var(--bg)" />
    </svg>
  );
}
