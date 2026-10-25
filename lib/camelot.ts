// Camelot wheel helpers shared by the UI and the set logic (pure, no React).

export function parseCamelot(k?: string | null): { n: number; l: "A" | "B" } | null {
  const m = /^(\d{1,2})([AB])$/i.exec((k ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? { n, l: m[2].toUpperCase() as "A" | "B" } : null;
}

// one hue per wheel position, minor (A) deeper, major (B) lighter
export function keyColor(k?: string | null): string {
  const c = parseCamelot(k);
  if (!c) return "#5b6472";
  const hue = (c.n * 30 + 150) % 360;
  return c.l === "A" ? `hsl(${hue} 70% 58%)` : `hsl(${hue} 80% 72%)`;
}

export type Compat = { level: "same" | "good" | "boost" | "clash" | "unknown"; label: string; color: string };

// harmonic mixing on the Camelot wheel: same key, relative (A↔B), ±1 = smooth; ±2 = energy boost; else clash
export function keyCompat(a?: string | null, b?: string | null): Compat {
  const x = parseCamelot(a);
  const y = parseCamelot(b);
  if (!x || !y) return { level: "unknown", label: "tonalité ?", color: "#5b6472" };
  const d = Math.min((x.n - y.n + 12) % 12, (y.n - x.n + 12) % 12);
  if (d === 0 && x.l === y.l) return { level: "same", label: "même tonalité", color: "#34d399" };
  if (d === 0) return { level: "good", label: "relative", color: "#34d399" };
  if (d === 1 && x.l === y.l) return { level: "good", label: "voisine", color: "#34d399" };
  if (d === 2 && x.l === y.l) return { level: "boost", label: "montée d'énergie", color: "#ffcc00" };
  return { level: "clash", label: "dissonant", color: "#f87171" };
}

