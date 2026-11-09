"use client"
export function renderThumbB(kind: string, c: string): React.ReactElement | null {
  const S = { fill: "none", stroke: c, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (kind) {
    case "curve":
      return (
        <g>
          <line {...S} x1="10" y1="8" x2="10" y2="48" stroke={c} strokeWidth="1.5" opacity="0.5" />
          <line {...S} x1="10" y1="48" x2="86" y2="48" stroke={c} strokeWidth="1.5" opacity="0.5" />
          <polyline {...S} points="10,48 48,22 66,16 86,12" />
        </g>
      );
    case "gate":
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <line {...S} key={i} x1={10 + 6.5 * i} y1={28 - [3, 3, 3, 18, 24, 20, 3, 3, 3, 22, 16, 3][i]} x2={10 + 6.5 * i} y2={28 + [3, 3, 3, 18, 24, 20, 3, 3, 3, 22, 16, 3][i]} />
          ))}
          <line {...S} x1="6" y1="20" x2="90" y2="20" strokeDasharray="3 3" strokeWidth="1.5" />
          <line {...S} x1="6" y1="36" x2="90" y2="36" strokeDasharray="3 3" strokeWidth="1.5" />
        </g>
      );
    case "clip":
      return (
        <g>
          <polyline {...S} points="8,28 14,12 38,12 46,28 54,44 78,44 86,28 88,28" />
        </g>
      );
    case "fold":
      return (
        <g>
          <polyline {...S} points="8,40 22,10 36,40 48,20 60,40 72,14 88,40" />
        </g>
      );
    case "steps":
      return (
        <g>
          <polyline {...S} points="8,44 20,44 20,34 32,34 32,24 44,24 44,14 56,14 56,24 68,24 68,34 80,34 80,44 88,44" />
        </g>
      );
    case "ring":
      return (
        <g>
          <circle {...S} cx="38" cy="28" r="16" />
          <circle {...S} cx="58" cy="28" r="16" fill={c} fillOpacity="0.25" />
        </g>
      );
    case "reverb":
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => (
            <line {...S} key={i} x1={12 + 7 * i} y1={28 - Math.min(30 - 2 * i, 24)} x2={12 + 7 * i} y2={28 + Math.min(30 - 2 * i, 24)} opacity={1 - i * 0.07} />
          ))}
        </g>
      );
    case "delay":
      return (
        <g>
          {Array.from({ length: 6 }, (_, i) => (
            <circle {...S} key={i} cx={[14, 34, 52, 66, 76, 84][i]} cy="28" r={[10, 8, 6, 5, 4, 3][i]} opacity={1 - i * 0.14} />
          ))}
        </g>
      );
    case "mod":
      return (
        <g>
          <path {...S} d="M8 28 C 20 6, 36 6, 48 28 S 76 50, 88 28" />
        </g>
      );
    case "surround":
      return (
        <g>
          <circle {...S} cx="48" cy="28" r="20" strokeDasharray="4 4" />
          <circle {...S} cx="48" cy="28" r="3" fill={c} fillOpacity="0.3" />
          <circle {...S} cx="48" cy="8" r="3" fill={c} fillOpacity="0.3" />
          <circle {...S} cx="48" cy="48" r="3" fill={c} fillOpacity="0.3" />
          <circle {...S} cx="28" cy="28" r="3" fill={c} fillOpacity="0.3" />
          <circle {...S} cx="68" cy="28" r="3" fill={c} fillOpacity="0.3" />
        </g>
      );
    default:
      return null;
  }
}