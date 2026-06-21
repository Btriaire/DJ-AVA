export type Piece = { color: "w" | "b"; king: boolean };
export type Board = (Piece | null)[][];
export type Move = { from: [number, number]; to: [number, number]; captures: [number, number][] };

const SIZE = 6;

export function initBoard(): Board {
  const b: Board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(null));
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < SIZE; c++)
      if ((r + c) % 2 === 1) b[r][c] = { color: "b", king: false };
  for (let r = 4; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if ((r + c) % 2 === 1) b[r][c] = { color: "w", king: false };
  return b;
}

function cloneBoard(b: Board): Board {
  return b.map(row => row.map(cell => cell ? { ...cell } : null));
}

function dirs(color: "w" | "b", king: boolean): [number, number][] {
  if (king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return color === "w" ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}

function expandCaptures(
  board: Board,
  r: number, c: number,
  color: "w" | "b",
  capturedSet: Set<string>
): { to: [number, number]; caps: [number, number][] }[] {
  const piece = board[r][c];
  if (!piece) return [];
  const opp = color === "w" ? "b" : "w";
  const results: { to: [number, number]; caps: [number, number][] }[] = [];

  for (const [dr, dc] of dirs(color, piece.king)) {
    const mr = r + dr, mc = c + dc;
    const nr = r + 2 * dr, nc = c + 2 * dc;
    if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
    const mid = board[mr]?.[mc];
    if (!mid || mid.color !== opp) continue;
    if (capturedSet.has(`${mr},${mc}`)) continue;
    if (board[nr][nc] !== null) continue;

    const nb = cloneBoard(board);
    const promoted = (color === "w" && nr === 0) || (color === "b" && nr === SIZE - 1);
    nb[nr][nc] = { ...piece, king: piece.king || promoted };
    nb[r][c] = null;
    nb[mr][mc] = null;

    const newSet = new Set([...capturedSet, `${mr},${mc}`]);
    const chains = expandCaptures(nb, nr, nc, color, newSet);
    if (chains.length) {
      for (const chain of chains)
        results.push({ to: chain.to, caps: [[mr, mc], ...chain.caps] });
    } else {
      results.push({ to: [nr, nc], caps: [[mr, mc]] });
    }
  }
  return results;
}

export function getMoves(board: Board, color: "w" | "b"): Move[] {
  const pieces: [number, number][] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (board[r][c]?.color === color) pieces.push([r, c]);

  const captures: Move[] = [];
  for (const [r, c] of pieces) {
    for (const { to, caps } of expandCaptures(board, r, c, color, new Set()))
      captures.push({ from: [r, c], to, captures: caps });
  }
  if (captures.length) return captures;

  const moves: Move[] = [];
  for (const [r, c] of pieces) {
    const piece = board[r][c]!;
    for (const [dr, dc] of dirs(color, piece.king)) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !board[nr][nc])
        moves.push({ from: [r, c], to: [nr, nc], captures: [] });
    }
  }
  return moves;
}

export function applyMove(board: Board, move: Move): Board {
  const nb = cloneBoard(board);
  const piece = { ...nb[move.from[0]][move.from[1]]! };
  nb[move.from[0]][move.from[1]] = null;
  for (const [r, c] of move.captures) nb[r][c] = null;
  const promoted =
    (piece.color === "w" && move.to[0] === 0) ||
    (piece.color === "b" && move.to[0] === SIZE - 1);
  nb[move.to[0]][move.to[1]] = { ...piece, king: piece.king || promoted };
  return nb;
}

function evaluate(board: Board): number {
  let score = 0;
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = p.king ? 3 : 1 + (p.color === "b" ? r : SIZE - 1 - r) * 0.05;
      score += p.color === "b" ? val : -val;
    }
  return score;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  const color = maximizing ? "b" : "w";
  const moves = getMoves(board, color);
  if (depth === 0 || moves.length === 0) return evaluate(board);
  if (maximizing) {
    let max = -Infinity;
    for (const m of moves) {
      const val = minimax(applyMove(board, m), depth - 1, alpha, beta, false);
      if (val > max) max = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return max;
  } else {
    let min = Infinity;
    for (const m of moves) {
      const val = minimax(applyMove(board, m), depth - 1, alpha, beta, true);
      if (val < min) min = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break;
    }
    return min;
  }
}

export function bestAIMove(board: Board): Move | null {
  const moves = getMoves(board, "b");
  if (!moves.length) return null;
  let best = moves[0];
  let bestVal = -Infinity;
  for (const m of moves) {
    const val = minimax(applyMove(board, m), 4, -Infinity, Infinity, false);
    if (val > bestVal) { bestVal = val; best = m; }
  }
  return best;
}

export const BOARD_SIZE = SIZE;
