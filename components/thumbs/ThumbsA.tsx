"use client"
import type { ReactElement } from "react";

export function renderThumbA(kind: string, c: string): ReactElement | null {
  const S = { fill: "none", stroke: c, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (kind) {
    case "pads":
      return (
        <g>
          {Array.from({ length: 8 }).map((_, i) => (
            <rect {...S} key={i} x={6 + 22 * (i % 4)} y={6 + 24 * Math.floor(i / 4)} width={18} height={20} rx={4}
              fill={i === 1 || i === 6 ? c : "none"} fillOpacity={i === 1 || i === 6 ? 0.35 : undefined} />
          ))}
        </g>
      );
    case "keys":
      return (
        <g>
          {Array.from({ length: 7 }).map((_, i) => (
            <rect {...S} key={i} x={8 + 11 * i} y={10} width={11} height={38} />
          ))}
          {[0, 1, 3, 4, 5].map((i) => (
            <rect {...S} key={i} x={8 + 11 * i + 7.5} y={10} width={7} height={22} fill={c} fillOpacity={0.6} />
          ))}
        </g>
      );
    case "wave":
      return (
        <g>
          {[4, 8, 14, 10, 18, 24, 16, 22, 26, 18, 12, 20, 10, 6, 12, 6, 4].map((h, i) => (
            <line {...S} key={i} x1={8 + 5.5 * i} y1={28 - h} x2={8 + 5.5 * i} y2={28 + h} />
          ))}
        </g>
      );
    case "chop":
      return (
        <g>
          {[4, 8, 14, 10, 18, 24, 16, 22, 26, 18, 12, 20, 10, 6, 12, 6, 4].map((h, i) => (
            <line {...S} key={i} x1={8 + 5.5 * i} y1={28 - h} x2={8 + 5.5 * i} y2={28 + h} />
          ))}
          {[30, 52, 74].map((x, i) => (
            <line {...S} key={i} x1={x} y1={4} x2={x} y2={52} strokeDasharray="3 3" strokeWidth={1.5} />
          ))}
        </g>
      );
    case "bars":
      return (
        <g>
          {[10, 18, 28, 22, 34, 26, 16, 22, 12].map((h, i) => (
            <rect {...S} key={i} x={10 + 9 * i} y={48 - h} width={6} height={h} fill={c} fillOpacity={0.55} />
          ))}
        </g>
      );
    case "knobs":
      return (
        <g>
          {[20, 48, 76].map((cx, i) => (
            <g key={i}>
              <circle {...S} cx={cx} cy={28} r={11} />
              <line {...S} x1={cx} y1={28} x2={cx + (i === 0 ? 7 : i === 1 ? 3 : 11)} y2={28 + (i === 0 ? -8 : i === 1 ? -11 : 1)} />
            </g>
          ))}
        </g>
      );
    case "disc":
      return (
        <g>
          <circle {...S} cx={48} cy={28} r={22} />
          <circle {...S} cx={48} cy={28} r={5} />
          <line {...S} x1={48} y1={28} x2={66} y2={16} />
          <circle cx={66} cy={16} r={2} fill={c} />
        </g>
      );
    case "ramp":
      return (
        <polyline {...S} points="8,46 24,46 24,36 40,36 40,26 56,26 56,14 72,14 72,50 88,50" />
      );
    case "violin":
      return (
        <g>
          <circle {...S} cx={48} cy={38} r={12} />
          <circle {...S} cx={48} cy={22} r={9} />
          <line {...S} x1={46} y1={13} x2={46} y2={3} />
          <line {...S} x1={50} y1={13} x2={50} y2={3} />
          <line {...S} x1={48} y1={13} x2={48} y2={50} />
        </g>
      );
    default:
      return null;
  }
}