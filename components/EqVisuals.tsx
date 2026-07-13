"use client";

// Shared EQ visuals: levelColor + DigitalVU bar for consistent green→amber→red across all EQs

export function levelColor(t: number): string {
  if (t < 0.5) return "#39ff6a";      // green
  if (t < 0.7) return "#d8ff32";      // yellow-green
  if (t < 0.85) return "#ffae24";     // amber
  return "#ff3b30";                   // red
}

export function DigitalVU({ level, vertical = false }: { level: number; vertical?: boolean }) {
  const SEGS = 20;
  const lit = Math.round(Math.min(1, Math.max(0, level)) * SEGS);
  const segs = Array.from({ length: SEGS }, (_, i) => {
    const on = i < lit;
    const rev = SEGS - 1 - i; // 0 = top when vertical
    const segColor = rev >= SEGS - 3 ? "#ff3b30" : rev >= SEGS - 6 ? "#ffd23d" : "#39ff6a";
    return (
      <span key={i}
        style={{
          display: "block",
          width: vertical ? 6 : 3,
          height: vertical ? 3 : 6,
          borderRadius: 1,
          background: on ? segColor : "#1a1a1a",
          boxShadow: on ? `0 0 4px ${segColor}` : "none",
          margin: "0.5px",
        }}
      />
    );
  });
  return (
    <div style={{ display: "flex", flexDirection: vertical ? "column" : "row", alignItems: "center" }}>
      {vertical ? [...segs].reverse() : segs}
    </div>
  );
}
