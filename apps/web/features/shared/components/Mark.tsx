export function Mark({ size = 20 }: { size?: number }) {
  return (
    // biome-ignore lint/performance/noImgElement: small brand mark, no optimization needed
    <img
      src="/logo/mark.png"
      alt="nabit"
      width={size}
      height={size}
      style={{ display: "block", width: size, height: size }}
    />
  );
}
