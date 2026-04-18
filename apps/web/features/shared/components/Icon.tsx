import type { SVGProps } from "react";

export type IconName =
  | "search"
  | "plus"
  | "cmd"
  | "tag"
  | "archive"
  | "inbox"
  | "close"
  | "arrow-right"
  | "arrow-up"
  | "arrow-down"
  | "dot"
  | "check"
  | "external"
  | "trash"
  | "chevron-down"
  | "chevron-right"
  | "share"
  | "highlight"
  | "sort"
  | "filter"
  | "link"
  | "clock"
  | "settings";

type IconProps = {
  name: IconName;
  size?: number;
  stroke?: number;
} & Omit<SVGProps<SVGSVGElement>, "name" | "stroke">;

export function Icon({
  name,
  size = 14,
  stroke = 1.5,
  ...rest
}: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable={false}
      {...rest}
    >
      <title>{name}</title>
      <IconPaths name={name} />
    </svg>
  );
}

function IconPaths({ name }: { name: IconName }) {
  switch (name) {
    case "search":
      return (
        <>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 L14 14" />
        </>
      );
    case "plus":
      return <path d="M8 2 V14 M2 8 H14" />;
    case "cmd":
      return (
        <path d="M5 2h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 2h0a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h0" />
      );
    case "tag":
      return (
        <>
          <path d="M2 2 H8 L14 8 L8 14 L2 8 Z" />
          <circle cx="5" cy="5" r="0.8" fill="currentColor" />
        </>
      );
    case "archive":
      return (
        <>
          <rect x="2" y="2" width="12" height="4" />
          <rect x="3" y="6" width="10" height="8" />
          <path d="M6 9 H10" />
        </>
      );
    case "inbox":
      return (
        <>
          <path d="M2 2 V10 H14 V2" />
          <path d="M2 10 L5 6 H11 L14 10" />
        </>
      );
    case "close":
      return <path d="M3 3 L13 13 M13 3 L3 13" />;
    case "arrow-right":
      return <path d="M3 8 H13 M9 4 L13 8 L9 12" />;
    case "arrow-up":
      return <path d="M8 13 V3 M4 7 L8 3 L12 7" />;
    case "arrow-down":
      return <path d="M8 3 V13 M4 9 L8 13 L12 9" />;
    case "dot":
      return <circle cx="8" cy="8" r="2" fill="currentColor" />;
    case "check":
      return <path d="M3 8 L7 12 L13 4" />;
    case "external":
      return <path d="M6 3 H3 V13 H13 V10 M10 3 H13 V6 M8 8 L13 3" />;
    case "trash":
      return <path d="M3 4 H13 M5 4 V2 H11 V4 M5 4 L6 14 H10 L11 4" />;
    case "chevron-down":
      return <path d="M3 5 L8 11 L13 5" />;
    case "chevron-right":
      return <path d="M5 3 L11 8 L5 13" />;
    case "share":
      return (
        <>
          <circle cx="4" cy="8" r="2" />
          <circle cx="12" cy="3" r="2" />
          <circle cx="12" cy="13" r="2" />
          <path d="M5.5 7 L10.5 4 M5.5 9 L10.5 12" />
        </>
      );
    case "highlight":
      return (
        <>
          <path d="M3 13 L3 11 L10 4 L12 6 L5 13 Z" />
          <path d="M9 5 L11 7" />
        </>
      );
    case "sort":
      return (
        <>
          <path d="M4 3 V13 M2 11 L4 13 L6 11" />
          <path d="M11 3 V13 M9 5 L11 3 L13 5" />
        </>
      );
    case "filter":
      return <path d="M2 3 H14 L10 8 V13 L6 11 V8 Z" />;
    case "link":
      return (
        <path d="M7 5 H4 A3 3 0 0 0 4 11 H7 M9 5 H12 A3 3 0 0 1 12 11 H9 M6 8 H10" />
      );
    case "clock":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4 V8 L11 10" />
        </>
      );
    case "settings":
      return (
        <>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1 V3 M8 13 V15 M15 8 H13 M3 8 H1 M12.95 3.05 L11.54 4.46 M4.46 11.54 L3.05 12.95 M12.95 12.95 L11.54 11.54 M4.46 4.46 L3.05 3.05" />
        </>
      );
    default:
      return null;
  }
}
