import { type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill } from "remotion";

const INK = "#343730";
const MUTED = "#62675c";
const font = '"Instrument Sans", "Inter", sans-serif';
const digits: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ":": ["0", "1", "1", "0", "1", "1", "0"],
};

export function DotNumber({
  value,
  height = 64,
  color = INK,
  style,
}: {
  value: string;
  height?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const characters = [...value];
  const width =
    characters.reduce((sum, char) => sum + (char === ":" ? 3 : 7), 0) - 2;
  let offset = 0;
  return (
    <svg
      width={(width * height) / 9}
      height={height}
      viewBox={`-1 -1 ${width} 9`}
      role="img"
      aria-label={value}
      style={{ display: "block", overflow: "visible", ...style }}
    >
      {characters.map((char, index) => {
        const x = offset;
        offset += char === ":" ? 3 : 7;
        return (
          <g key={index} fill={color}>
            {(digits[char] ?? digits["0"]).flatMap((row, y) =>
              [...row].map((lit, column) =>
                lit === "1" ? (
                  <circle
                    key={`${y}-${column}`}
                    cx={x + column}
                    cy={y}
                    r={0.28}
                  />
                ) : null
              )
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Canvas({
  children,
  padding = 30,
}: {
  children: ReactNode;
  padding?: number;
}) {
  return (
    <AbsoluteFill
      style={{
        background: "#eaece5",
        color: INK,
        fontFamily: font,
        padding,
        boxSizing: "border-box",
        overflow: "hidden",
        fontWeight: 400,
        display: "block",
        lineHeight: 1.2,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export function Heading({ left, right }: { left: string; right: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 18,
        letterSpacing: "-0.35px",
        marginBottom: 22,
      }}
    >
      <span>{left}</span>
      <span style={{ fontSize: 15, color: MUTED }}>{right}</span>
    </div>
  );
}

export function Check({
  color = INK,
  size = 17,
}: {
  color?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m4 10 4 4 8-8"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
