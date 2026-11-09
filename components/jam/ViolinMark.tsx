import React from 'react';

export function ViolinMark({ color, className }: { color: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 120 300"
      className={className}
    >
      <path
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M60 118 C 74 118, 90 128, 88 152 C 87 172, 72 184, 72 205 C 72 226, 104 232, 102 258 C 100 280, 82 290, 60 290 C 38 290, 20 280, 18 258 C 16 232, 48 226, 48 205 C 48 184, 33 172, 32 152 C 30 128, 46 118, 60 118 Z"
      />
      <path
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M52 120 V 40 M68 120 V 40 M52 40 H 68"
      />
      <path
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M52 22 H 68 V 40 H 52 Z M52 22 C 52 8, 66 8, 66 16 C 66 21, 60 21, 60 17"
      />
      <path
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M74 180 Q 80 200, 80 236 M46 180 Q 40 200, 40 236"
      />
      <path
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M46 226 H 74 M46 226 V 232 M74 226 V 232"
      />
      <path
        fill="none"
        stroke={color}
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M54 36 V 266 M58 36 V 266 M62 36 V 266 M66 36 V 266 M52 262 H 68 L 65 272 H 55 Z"
      />
    </svg>
  );
}
