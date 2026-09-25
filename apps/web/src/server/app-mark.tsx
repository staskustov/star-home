import type { ReactElement } from "react";

export const brandRed = "#f04444";
export const brandPaper = "#F6F4F0";
export const brandWhite = "#ffffff";

const starPath =
  "M12 2.5c.6 5.1 3.4 8.4 9.5 9.5-6.1 1.1-8.9 4.4-9.5 9.5-.6-5.1-3.4-8.4-9.5-9.5 6.1-1.1 8.9-4.4 9.5-9.5Z";

const housePath = "M32 6.2 58.8 29.4H53V58H11V29.4H5.2L32 6.2Z";

export function StarLogo({ fill, size }: { fill: string; size: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path d={starPath} />
    </svg>
  );
}

export function HouseWithStar({
  house,
  star,
  size,
}: {
  house: string;
  star: string;
  size: number;
}): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d={housePath} fill={house} />
      <g transform="translate(32 40.2) scale(0.92) translate(-12 -12)">
        <path d={starPath} fill={star} />
      </g>
    </svg>
  );
}

export function AppIconMark({ canvas, markRatio }: { canvas: number; markRatio: number }): ReactElement {
  const mark = Math.round(canvas * markRatio);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: brandPaper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <HouseWithStar house={brandRed} star={brandWhite} size={mark} />
    </div>
  );
}

export function FaviconMark({ canvas }: { canvas: number }): ReactElement {
  const mark = Math.round(canvas * 0.62);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: brandRed,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <StarLogo fill={brandWhite} size={mark} />
    </div>
  );
}
