export type Pt = [number, number];
export type Piece = { id: string; points: Pt[]; color: string };
export type Figure = { title: string; w: number; h: number; pieces: Piece[] };

const C = ["#0f380f", "#306230", "#6e8b2e", "#8bac0f", "#9bbc0f"];

export const FIGURES: Figure[] = [
  {
    // Tangram classique : carré disséqué en 7 pièces
    title: "Le carré",
    w: 8,
    h: 8,
    pieces: [
      { id: "sq-lt1", points: [[0, 0], [8, 0], [4, 4]], color: C[0] },
      { id: "sq-lt2", points: [[0, 0], [4, 4], [0, 8]], color: C[2] },
      { id: "sq-st1", points: [[8, 0], [8, 4], [6, 2]], color: C[4] },
      { id: "sq-sq", points: [[6, 2], [8, 4], [6, 6], [4, 4]], color: C[1] },
      { id: "sq-st2", points: [[8, 4], [8, 8], [6, 6]], color: C[3] },
      { id: "sq-mt", points: [[0, 8], [4, 4], [6, 6]], color: C[4] },
      { id: "sq-t", points: [[0, 8], [6, 6], [8, 8]], color: C[1] },
    ],
  },
  {
    title: "Le triangle",
    w: 8,
    h: 8,
    pieces: [
      { id: "tr1", points: [[4, 0], [2, 4], [6, 4]], color: C[0] },
      { id: "tr2", points: [[0, 8], [2, 4], [4, 8]], color: C[1] },
      { id: "tr3", points: [[8, 8], [6, 4], [4, 8]], color: C[2] },
      { id: "tr4", points: [[2, 4], [6, 4], [4, 8]], color: C[3] },
    ],
  },
  {
    title: "La maison",
    w: 8,
    h: 12,
    pieces: [
      { id: "ho0", points: [[0, 5], [8, 5], [4, 0]], color: C[4] },
      { id: "ho1", points: [[0, 5], [8, 5], [4, 8.5]], color: C[0] },
      { id: "ho2", points: [[8, 5], [8, 12], [4, 8.5]], color: C[1] },
      { id: "ho3", points: [[8, 12], [0, 12], [4, 8.5]], color: C[2] },
      { id: "ho4", points: [[0, 12], [0, 5], [4, 8.5]], color: C[3] },
    ],
  },
  {
    // Voilier : deux voiles + coque
    title: "Le bateau",
    w: 8,
    h: 10,
    pieces: [
      { id: "bo-sailL", points: [[4, 0], [4, 7], [0, 7]], color: C[1] },
      { id: "bo-sailR", points: [[4, 0], [7, 7], [4, 7]], color: C[3] },
      { id: "bo-hullL", points: [[0, 7], [2, 7], [2, 10]], color: C[2] },
      { id: "bo-hullM", points: [[2, 7], [6, 7], [6, 10], [2, 10]], color: C[0] },
      { id: "bo-hullR", points: [[6, 7], [8, 7], [6, 10]], color: C[4] },
    ],
  },
  {
    // Flèche vers la droite
    title: "La flèche",
    w: 10,
    h: 8,
    pieces: [
      { id: "ar-s1", points: [[0, 2], [6, 2], [6, 6]], color: C[1] },
      { id: "ar-s2", points: [[0, 2], [6, 6], [0, 6]], color: C[3] },
      { id: "ar-h1", points: [[6, 0], [10, 4], [6, 4]], color: C[0] },
      { id: "ar-h2", points: [[6, 4], [10, 4], [6, 8]], color: C[2] },
    ],
  },
  {
    // Losange à 4 quartiers
    title: "Le losange",
    w: 8,
    h: 8,
    pieces: [
      { id: "lo1", points: [[4, 0], [8, 4], [4, 4]], color: C[0] },
      { id: "lo2", points: [[8, 4], [4, 8], [4, 4]], color: C[2] },
      { id: "lo3", points: [[4, 8], [0, 4], [4, 4]], color: C[4] },
      { id: "lo4", points: [[0, 4], [4, 0], [4, 4]], color: C[1] },
    ],
  },
];

export function bbox(points: Pt[]) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  return { minX, minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

export function toPath(points: Pt[]): string {
  return points.map((p) => p.join(",")).join(" ");
}

export function centroid(points: Pt[]): Pt {
  const n = points.length;
  let x = 0, y = 0;
  for (const p of points) { x += p[0]; y += p[1]; }
  return [x / n, y / n];
}

/** Tourne un polygone de `deg` degrés autour de son centre (ou d'un centre donné). */
export function rotatePoints(points: Pt[], deg: number, center?: Pt): Pt[] {
  const [cx, cy] = center ?? centroid(points);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  return points.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as Pt;
  });
}

function sameVertexSet(a: Pt[], b: Pt[], tol = 0.02): boolean {
  if (a.length !== b.length) return false;
  const used = new Array(b.length).fill(false);
  for (const p of a) {
    let found = -1;
    for (let i = 0; i < b.length; i++) {
      if (!used[i] && Math.abs(p[0] - b[i][0]) < tol && Math.abs(p[1] - b[i][1]) < tol) {
        found = i;
        break;
      }
    }
    if (found < 0) return false;
    used[found] = true;
  }
  return true;
}

/** Plus petit angle (multiple de 45°) qui laisse la pièce identique à elle-même ; 360 sinon. */
export function rotationalSymmetry(points: Pt[]): number {
  for (const ang of [45, 90, 135, 180]) {
    if (sameVertexSet(points, rotatePoints(points, ang))) return ang;
  }
  return 360;
}

export function pointInPolygon(x: number, y: number, points: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
