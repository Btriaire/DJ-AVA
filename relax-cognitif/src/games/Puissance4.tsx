import { useEffect, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";
import {
  LEVEL_DIMS,
  bestAIMove,
  dropRow,
  clone,
  emptyBoard,
  isFull,
  winningCells,
  type P4Board,
  type P4Level,
} from "../lib/puissance4";

const LEVELS: { id: P4Level; label: string }[] = [
  { id: "facile", label: "Facile" },
  { id: "moyen", label: "Moyen" },
  { id: "difficile", label: "Difficile" },
];

type Status = "playing" | "win" | "lose" | "draw";

export default function Puissance4() {
  const [level, setLevel] = useState<P4Level>("facile");
  const dims = LEVEL_DIMS[level];
  const { cols: COLS, rows: ROWS } = dims;
  const [board, setBoard] = useState<P4Board>(() => emptyBoard(LEVEL_DIMS.facile));
  const [turn, setTurn] = useState<"R" | "J">("R"); // R = joueur
  const [status, setStatus] = useState<Status>("playing");
  const [aiThinking, setAiThinking] = useState(false);
  const [winCells, setWinCells] = useState<Set<string>>(new Set());
  const session = useGameSession("puissance4", level);

  // Tour de l'IA
  useEffect(() => {
    if (status !== "playing" || turn !== "J") return;
    setAiThinking(true);
    const tid = setTimeout(() => {
      const col = bestAIMove(board, level);
      if (col >= 0) {
        const row = dropRow(board, col);
        if (row >= 0) {
          const next = clone(board);
          next[row][col] = "J";
          finishMove(next, "J");
        }
      }
      setAiThinking(false);
    }, 420);
    return () => clearTimeout(tid);
  }, [turn, status]); // eslint-disable-line

  function finishMove(next: P4Board, who: "R" | "J") {
    setBoard(next);
    const win = winningCells(next, who);
    if (win) {
      setWinCells(new Set(win.map(([r, c]) => `${r},${c}`)));
      if (who === "J") { setStatus("lose"); session.record("failure"); }
      else { setStatus("win"); session.record("success"); }
      return;
    }
    if (isFull(next)) { setStatus("draw"); session.record("abandon"); return; }
    setTurn(who === "R" ? "J" : "R");
  }

  function play(col: number) {
    if (status !== "playing" || turn !== "R" || aiThinking) return;
    const row = dropRow(board, col);
    if (row < 0) return;
    const next = clone(board);
    next[row][col] = "R";
    finishMove(next, "R");
  }

  function newGame() {
    setBoard(emptyBoard(dims));
    setTurn("R");
    setStatus("playing");
    setAiThinking(false);
    setWinCells(new Set());
    session.reset();
  }

  function changeLevel(l: P4Level) {
    setLevel(l);
    setBoard(emptyBoard(LEVEL_DIMS[l]));
    setTurn("R");
    setStatus("playing");
    setAiThinking(false);
    setWinCells(new Set());
    session.reset();
  }

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={`seg-btn ${level === l.id ? "active" : ""}`}
              onClick={() => changeLevel(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={newGame}>
          Nouvelle partie
        </button>
      </div>

      <p className={`status ${status === "win" ? "win" : ""}`}>
        {status === "win" ? "Bravo, vous gagnez !" :
         status === "lose" ? "L'ordinateur gagne — réessayez !" :
         status === "draw" ? "Match nul !" :
         aiThinking ? "L'ordinateur réfléchit…" :
         "À vous de jouer (jetons verts)"}
      </p>

      <WinReward game="puissance4" show={session.won} />

      <div className="p4-board">
        {/* boutons de colonne */}
        <div className="p4-cols" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {Array.from({ length: COLS }, (_, c) => (
            <button
              key={c}
              className="p4-coldrop"
              onClick={() => play(c)}
              disabled={status !== "playing" || turn !== "R" || aiThinking || dropRow(board, c) < 0}
              aria-label={`Jouer colonne ${c + 1}`}
            >
              ▾
            </button>
          ))}
        </div>
        <div className="p4-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
          {Array.from({ length: ROWS }, (_, r) =>
            Array.from({ length: COLS }, (_, c) => {
              const cell = board[r][c];
              const win = winCells.has(`${r},${c}`);
              return (
                <div key={`${r}-${c}`} className="p4-cell">
                  <span
                    className={[
                      "p4-disc",
                      cell === "R" ? "red" : cell === "J" ? "yellow" : "empty",
                      win ? "win" : "",
                    ].join(" ")}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>

      {status !== "playing" && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="btn" onClick={newGame}>Rejouer</button>
        </div>
      )}

      <p className="page-sub" style={{ marginTop: 12, fontSize: 13 }}>
        Alignez 4 jetons — horizontale, verticale ou diagonale — avant l'ordinateur.
        Grille {COLS}×{ROWS}.
      </p>
    </div>
  );
}
