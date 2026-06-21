export type Grid = number[]; // N*N cells, 0 = empty

export type SudokuSize = {
  key: string;
  label: string;
  n: number; // grille N×N
  boxW: number; // colonnes par bloc
  boxH: number; // lignes par bloc
};

export const SIZES: Record<string, SudokuSize> = {
  "4": { key: "4", label: "4 × 4", n: 4, boxW: 2, boxH: 2 },
  "6": { key: "6", label: "6 × 6", n: 6, boxW: 3, boxH: 2 },
  "9": { key: "9", label: "9 × 9", n: 9, boxW: 3, boxH: 3 },
};

export type Level = "facile" | "moyen" | "difficile";

const FRACTIONS: Record<Level, number> = {
  facile: 0.45,
  moyen: 0.55,
  difficile: 0.64,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isSafe(g: Grid, idx: number, val: number, sz: SudokuSize): boolean {
  const { n, boxW, boxH } = sz;
  const row = Math.floor(idx / n);
  const col = idx % n;
  for (let c = 0; c < n; c++) if (g[row * n + c] === val) return false;
  for (let r = 0; r < n; r++) if (g[r * n + col] === val) return false;
  const br = Math.floor(row / boxH) * boxH;
  const bc = Math.floor(col / boxW) * boxW;
  for (let r = 0; r < boxH; r++)
    for (let c = 0; c < boxW; c++)
      if (g[(br + r) * n + (bc + c)] === val) return false;
  return true;
}

function fill(g: Grid, sz: SudokuSize, pos = 0): boolean {
  const total = sz.n * sz.n;
  if (pos === total) return true;
  if (g[pos] !== 0) return fill(g, sz, pos + 1);
  const values = shuffle(Array.from({ length: sz.n }, (_, i) => i + 1));
  for (const v of values) {
    if (isSafe(g, pos, v, sz)) {
      g[pos] = v;
      if (fill(g, sz, pos + 1)) return true;
      g[pos] = 0;
    }
  }
  return false;
}

export function solvedGrid(sz: SudokuSize): Grid {
  const g = new Array(sz.n * sz.n).fill(0);
  fill(g, sz);
  return g;
}

export function newPuzzle(sizeKey: string, level: Level) {
  const sz = SIZES[sizeKey];
  const total = sz.n * sz.n;
  const solution = solvedGrid(sz);
  const puzzle = [...solution];
  const holes = Math.round(total * FRACTIONS[level]);
  const order = shuffle([...Array(total).keys()]);
  for (let i = 0; i < holes; i++) puzzle[order[i]] = 0;
  return { puzzle, solution, size: sz };
}
