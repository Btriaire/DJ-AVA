export type Pt = [number, number];
export type Piece = { id: string; points: Pt[]; color: string };
export type Figure = { title: string; w: number; h: number; pieces: Piece[] };

// Palette douce et variée (esprit « Petit Bambou ») — 8 teintes distinctes
const C = [
  "#4f9d83", // vert sauge
  "#79b3c0", // bleu calme
  "#e6a93f", // or
  "#e8835f", // terre cuite
  "#7c9a5a", // olive
  "#b08bc4", // glycine
  "#d98c6a", // abricot
  "#6f9fb5", // ardoise
];

export const FIGURES: Figure[] = [
  // ── Les 3 figures simples (initiation) ───────────────────────────
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
      { id: "sq-mt", points: [[0, 8], [4, 4], [6, 6]], color: C[5] },
      { id: "sq-t", points: [[0, 8], [6, 6], [8, 8]], color: C[6] },
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

  // ── Figures plus complexes (6 à 8 pièces) ────────────────────────
  {
    // Voilier : deux voiles + coque en 5 pièces
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
    // Tête de chat : visage en 4 triangles + 2 oreilles
    title: "Le chat",
    w: 6,
    h: 9,
    pieces: [
      { id: "ca-earL", points: [[0, 3], [2, 3], [0, 0]], color: C[3] },
      { id: "ca-earR", points: [[6, 3], [4, 3], [6, 0]], color: C[6] },
      { id: "ca-f1", points: [[0, 3], [6, 3], [3, 6]], color: C[0] },
      { id: "ca-f2", points: [[6, 3], [6, 9], [3, 6]], color: C[1] },
      { id: "ca-f3", points: [[6, 9], [0, 9], [3, 6]], color: C[4] },
      { id: "ca-f4", points: [[0, 9], [0, 3], [3, 6]], color: C[5] },
    ],
  },
  {
    // Poisson : nageoire (2 pièces) + corps en losange (4 pièces)
    title: "Le poisson",
    w: 11,
    h: 8,
    pieces: [
      { id: "fi-tail1", points: [[0, 1], [3, 4], [0, 4]], color: C[3] },
      { id: "fi-tail2", points: [[0, 7], [3, 4], [0, 4]], color: C[6] },
      { id: "fi-b1", points: [[3, 4], [7, 0], [7, 4]], color: C[0] },
      { id: "fi-b2", points: [[7, 0], [11, 4], [7, 4]], color: C[1] },
      { id: "fi-b3", points: [[11, 4], [7, 8], [7, 4]], color: C[4] },
      { id: "fi-b4", points: [[7, 8], [3, 4], [7, 4]], color: C[5] },
    ],
  },
  {
    // Sapin : 3 étages de feuillage (5 triangles) + tronc
    title: "Le sapin",
    w: 8,
    h: 12,
    pieces: [
      { id: "tr-top", points: [[2, 3], [6, 3], [4, 1]], color: C[0] },
      { id: "tr-m1", points: [[1, 6], [4, 3], [4, 6]], color: C[1] },
      { id: "tr-m2", points: [[7, 6], [4, 3], [4, 6]], color: C[4] },
      { id: "tr-b1", points: [[0, 10], [4, 6], [4, 10]], color: C[5] },
      { id: "tr-b2", points: [[8, 10], [4, 6], [4, 10]], color: C[6] },
      { id: "tr-trunk", points: [[3, 10], [5, 10], [5, 12], [3, 12]], color: C[3] },
    ],
  },
  {
    // Fusée : ogive + corps (4 pièces) + 2 ailerons + flamme — 8 pièces
    title: "La fusée",
    w: 6,
    h: 14,
    pieces: [
      { id: "ro-nose", points: [[3, 0], [1, 4], [5, 4]], color: C[3] },
      { id: "ro-b1", points: [[1, 4], [5, 4], [3, 7.5]], color: C[0] },
      { id: "ro-b2", points: [[5, 4], [5, 11], [3, 7.5]], color: C[1] },
      { id: "ro-b3", points: [[5, 11], [1, 11], [3, 7.5]], color: C[5] },
      { id: "ro-b4", points: [[1, 11], [1, 4], [3, 7.5]], color: C[4] },
      { id: "ro-finL", points: [[0, 14], [1, 11], [1, 14]], color: C[7] },
      { id: "ro-finR", points: [[6, 14], [5, 11], [5, 14]], color: C[7] },
      { id: "ro-flame", points: [[2, 11], [4, 11], [3, 14]], color: C[6] },
    ],
  },
  {
    // Étoile / moulin : carré disséqué en 8 triangles autour du centre
    title: "L'étoile",
    w: 8,
    h: 8,
    pieces: [
      { id: "st1", points: [[0, 0], [4, 0], [4, 4]], color: C[0] },
      { id: "st2", points: [[4, 0], [8, 0], [4, 4]], color: C[1] },
      { id: "st3", points: [[8, 0], [8, 4], [4, 4]], color: C[2] },
      { id: "st4", points: [[8, 4], [8, 8], [4, 4]], color: C[3] },
      { id: "st5", points: [[8, 8], [4, 8], [4, 4]], color: C[4] },
      { id: "st6", points: [[4, 8], [0, 8], [4, 4]], color: C[5] },
      { id: "st7", points: [[0, 8], [0, 4], [4, 4]], color: C[6] },
      { id: "st8", points: [[0, 4], [0, 0], [4, 4]], color: C[7] },
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
