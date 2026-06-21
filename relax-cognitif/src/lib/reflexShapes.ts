// 50 formes SVG distinctes pour le jeu « Rapidité au clic ».
// Chaque forme est un chemin SVG (attribut `d`) dans un repère 100×100, centré en (50,50).

function pt(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function polygon(n: number, r = 44, rot = -90): string {
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(50, 50, r, rot + (i * 360) / n);
    d += (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return d + "Z";
}

function star(n: number, rOut = 46, rIn = 19, rot = -90): string {
  let d = "";
  for (let i = 0; i < 2 * n; i++) {
    const r = i % 2 ? rIn : rOut;
    const [x, y] = pt(50, 50, r, rot + (i * 180) / n);
    d += (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return d + "Z";
}

// « Rose » : silhouette ondulée à `p` bosses (effet fleur/marguerite).
function rose(p: number, base = 26, amp = 18): string {
  const steps = 120;
  let d = "";
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 360;
    const rr = base + amp * Math.abs(Math.cos((p * t * Math.PI) / 360));
    const [x, y] = pt(50, 50, rr, t);
    d += (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return d + "Z";
}

// Roue dentée à `n` dents.
function gear(n: number, rOut = 46, rIn = 36): string {
  let d = "";
  const seg = 360 / (n * 2);
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? rIn : rOut;
    const [x, y] = pt(50, 50, r, -90 + i * seg);
    d += (i ? "L" : "M") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return d + "Z";
}

const SPECIALS: string[] = [
  // cœur
  "M50,82 C20,58 22,30 40,30 C48,30 50,38 50,42 C50,38 52,30 60,30 C78,30 80,58 50,82 Z",
  // goutte
  "M50,12 C68,40 74,54 74,64 A24,24 0 1 1 26,64 C26,54 32,40 50,12 Z",
  // croissant de lune
  "M62,14 A40,40 0 1 0 62,86 A32,32 0 1 1 62,14 Z",
  // croix
  "M40,12 H60 V40 H88 V60 H60 V88 H40 V60 H12 V40 H40 Z",
  // bouclier
  "M50,12 L82,24 V52 C82,72 68,84 50,90 C32,84 18,72 18,52 V24 Z",
  // éclair
  "M56,8 L26,54 H46 L40,92 L74,40 H52 L56,8 Z",
  // losange
  "M50,8 L86,50 L50,92 L14,50 Z",
  // larme inversée / pétale
  "M50,90 C32,62 26,48 26,38 A24,24 0 1 1 74,38 C74,48 68,62 50,90 Z",
];

function build(): string[] {
  const out: string[] = [];
  // Polygones réguliers 3 → 12 côtés (10)
  for (let n = 3; n <= 12; n++) out.push(polygon(n));
  // Étoiles fines 4 → 12 pointes (9)
  for (let n = 4; n <= 12; n++) out.push(star(n, 46, 18));
  // Étoiles épaisses 5 → 10 pointes (6)
  for (let n = 5; n <= 10; n++) out.push(star(n, 46, 30));
  // Fleurs / roses 3 → 10 bosses (8)
  for (let p = 3; p <= 10; p++) out.push(rose(p));
  // Roues dentées 6, 8, 10, 12 dents (4)
  for (const n of [6, 8, 10, 12]) out.push(gear(n));
  // Formes spéciales (8)
  out.push(...SPECIALS);
  // -> 45, complétons à 50 avec quelques variantes
  out.push(polygon(5, 30, 90)); // pentagon pointe en bas
  out.push(star(6, 40, 26, 0));
  out.push(rose(5, 20, 24));
  out.push(gear(7));
  out.push(polygon(8, 40, -67.5)); // octogone tourné
  return out.slice(0, 50);
}

export const REFLEX_SHAPES: string[] = build();

export const REFLEX_COLORS: string[] = [
  "#4f9d83", "#c46b54", "#d49b2e", "#5c84c4", "#9c6cc4",
  "#3f9d6a", "#d4683f", "#c44e7a", "#2f8f9d", "#7a9c3f",
];
