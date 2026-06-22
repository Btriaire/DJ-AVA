export type P4Cell = "R" | "J" | null; // R = joueur, J = IA
export type P4Board = P4Cell[][]; // [row][col], row 0 = haut
export type P4Level = "facile" | "moyen" | "difficile";

// Taille de grille selon le niveau (plus c'est dur, plus c'est grand)
export type P4Dims = { cols: number; rows: number };
export const LEVEL_DIMS: Record<P4Level, P4Dims> = {
  facile: { cols: 6, rows: 5 },
  moyen: { cols: 7, rows: 6 },
  difficile: { cols: 8, rows: 7 },
};

const rowsOf = (board: P4Board) => board.length;
const colsOf = (board: P4Board) => board[0].length;
const centerCol = (board: P4Board) => Math.floor(colsOf(board) / 2);

export function emptyBoard(dims: P4Dims): P4Board {
  return Array.from({ length: dims.rows }, () => Array<P4Cell>(dims.cols).fill(null));
}

/** Ligne la plus basse libre d'une colonne, ou -1 si pleine */
export function dropRow(board: P4Board, col: number): number {
  for (let r = rowsOf(board) - 1; r >= 0; r--) {
    if (board[r][col] === null) return r;
  }
  return -1;
}

export function clone(board: P4Board): P4Board {
  return board.map((row) => [...row]);
}

export function validCols(board: P4Board): number[] {
  const cols: number[] = [];
  for (let c = 0; c < colsOf(board); c++) if (board[0][c] === null) cols.push(c);
  return cols;
}

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Renvoie les 4 cellules gagnantes si `who` a aligné 4, sinon null */
export function winningCells(board: P4Board, who: "R" | "J"): [number, number][] | null {
  const ROWS = rowsOf(board), COLS = colsOf(board);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== who) continue;
      for (const [dr, dc] of DIRS) {
        const cells: [number, number][] = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr][cc] !== who) break;
          cells.push([rr, cc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

export function isWin(board: P4Board, who: "R" | "J"): boolean {
  return winningCells(board, who) !== null;
}

export function isFull(board: P4Board): boolean {
  return board[0].every((c) => c !== null);
}

// ── Évaluation heuristique ────────────────────────────────────────
function scoreWindow(cells: P4Cell[]): number {
  const j = cells.filter((c) => c === "J").length;
  const r = cells.filter((c) => c === "R").length;
  if (j > 0 && r > 0) return 0; // fenêtre mixte, sans valeur
  if (j === 4) return 100000;
  if (r === 4) return -100000;
  if (j === 3) return 80;
  if (j === 2) return 8;
  if (r === 3) return -90; // bloquer un peu plus fort
  if (r === 2) return -8;
  return 0;
}

function evaluate(board: P4Board): number {
  const ROWS = rowsOf(board), COLS = colsOf(board), mid = centerCol(board);
  let score = 0;
  // préférence colonne centrale
  for (let r = 0; r < ROWS; r++) {
    if (board[r][mid] === "J") score += 6;
    else if (board[r][mid] === "R") score -= 6;
  }
  // toutes les fenêtres de 4
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of DIRS) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        const win: P4Cell[] = [];
        for (let k = 0; k < 4; k++) win.push(board[r + dr * k][c + dc * k]);
        score += scoreWindow(win);
      }
    }
  }
  return score;
}

function place(board: P4Board, col: number, who: "R" | "J"): P4Board | null {
  const row = dropRow(board, col);
  if (row < 0) return null;
  const next = clone(board);
  next[row][col] = who;
  return next;
}

// minimax alpha-beta. J = IA maximise, R = joueur minimise
function minimax(
  board: P4Board,
  depth: number,
  alpha: number,
  beta: number,
  maximizing: boolean
): number {
  if (isWin(board, "J")) return 100000 + depth;
  if (isWin(board, "R")) return -100000 - depth;
  const cols = validCols(board);
  if (depth === 0 || cols.length === 0) return evaluate(board);

  // ordre central d'abord
  const mid = centerCol(board);
  cols.sort((a, b) => Math.abs(mid - a) - Math.abs(mid - b));

  if (maximizing) {
    let best = -Infinity;
    for (const c of cols) {
      const next = place(board, c, "J")!;
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false));
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const c of cols) {
      const next = place(board, c, "R")!;
      best = Math.min(best, minimax(next, depth - 1, alpha, beta, true));
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }
}

const DEPTH: Record<P4Level, number> = { facile: 2, moyen: 4, difficile: 6 };

/** Meilleur coup de l'IA (colonne). Renvoie -1 si plus de coups. */
export function bestAIMove(board: P4Board, level: P4Level): number {
  const cols = validCols(board);
  if (cols.length === 0) return -1;

  // Coup immédiat gagnant
  for (const c of cols) {
    const next = place(board, c, "J")!;
    if (isWin(next, "J")) return c;
  }
  // Bloquer victoire immédiate du joueur
  for (const c of cols) {
    const next = place(board, c, "R")!;
    if (isWin(next, "R")) return c;
  }
  // Niveau facile : un peu d'aléatoire
  if (level === "facile" && Math.random() < 0.35) {
    return cols[Math.floor(Math.random() * cols.length)];
  }

  const depth = DEPTH[level];
  let bestScore = -Infinity;
  let bestCol = cols[0];
  const mid = centerCol(board);
  cols.sort((a, b) => Math.abs(mid - a) - Math.abs(mid - b));
  for (const c of cols) {
    const next = place(board, c, "J")!;
    const score = minimax(next, depth - 1, -Infinity, Infinity, false);
    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }
  return bestCol;
}
