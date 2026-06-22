import { useEffect, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";
import { applyMove, bestAIMove, getMoves, initBoard, BOARD_SIZE, type Board, type Move } from "../lib/dames";

const CELL = 50; // px par case

export default function Dames() {
  const [board, setBoard] = useState<Board>(() => initBoard());
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [selected, setSelected] = useState<[number, number] | null>(null);
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [allMoves, setAllMoves] = useState<Move[]>([]);
  const [status, setStatus] = useState<"playing" | "win" | "lose">("playing");
  const [aiThinking, setAiThinking] = useState(false);
  const session = useGameSession("dames", "");

  // Calcule les mouvements du joueur courant et détecte victoire/défaite
  useEffect(() => {
    if (status !== "playing") return;
    const moves = getMoves(board, turn);
    if (turn === "w") {
      setAllMoves(moves);
      if (moves.length === 0) { setStatus("lose"); session.record("failure"); }
    } else {
      // Tour IA
      setAllMoves([]);
      if (moves.length === 0) { setStatus("win"); session.record("success"); return; }
      setAiThinking(true);
      const tid = setTimeout(() => {
        const m = bestAIMove(board);
        if (m) { setBoard(b => applyMove(b, m)); setTurn("w"); }
        setSelected(null); setValidMoves([]); setAiThinking(false);
      }, 350);
      return () => clearTimeout(tid);
    }
  }, [board, turn, status]); // eslint-disable-line

  function handleCell(r: number, c: number) {
    if (turn !== "w" || status !== "playing" || aiThinking) return;
    const piece = board[r][c];

    if (selected) {
      const move = validMoves.find(m => m.to[0] === r && m.to[1] === c);
      if (move) {
        setBoard(b => applyMove(b, move));
        setTurn("b"); setSelected(null); setValidMoves([]);
        return;
      }
    }
    if (piece?.color === "w") {
      const from = allMoves.filter(m => m.from[0] === r && m.from[1] === c);
      if (!from.length) return;
      setSelected([r, c]); setValidMoves(from);
    } else {
      setSelected(null); setValidMoves([]);
    }
  }

  function newGame() {
    setBoard(initBoard()); setTurn("w"); setSelected(null);
    setValidMoves([]); setAllMoves([]); setStatus("playing");
    setAiThinking(false); session.reset();
  }

  const targets = new Set(validMoves.map(m => `${m.to[0]},${m.to[1]}`));

  return (
    <div>
      <div className="controls">
        <button className="btn btn-ghost" onClick={newGame}>Nouvelle partie</button>
      </div>

      <p className={`status ${status === "win" ? "win" : ""}`}>
        {status === "win" ? "Bravo, vous gagnez !" :
         status === "lose" ? "L'adversaire gagne — essayez encore !" :
         aiThinking ? "L'adversaire réfléchit…" :
         turn === "w" ? "À vous de jouer (pions verts)" : ""}
      </p>

      <WinReward game="dames" show={session.won} />

      <div className="dames-wrap">
        <div className="dames-board" style={{ width: CELL * BOARD_SIZE, height: CELL * BOARD_SIZE }}>
          {Array.from({ length: BOARD_SIZE }, (_, r) =>
            Array.from({ length: BOARD_SIZE }, (_, c) => {
              const dark = (r + c) % 2 === 1;
              const piece = board[r][c];
              const isSel = selected?.[0] === r && selected?.[1] === c;
              const isTarget = targets.has(`${r},${c}`);
              return (
                <div
                  key={`${r}-${c}`}
                  className={["dames-cell", dark ? "dark" : "light", isTarget ? "tgt" : ""].join(" ")}
                  style={{ left: c * CELL, top: r * CELL, width: CELL, height: CELL }}
                  onClick={() => handleCell(r, c)}
                  role="button"
                  tabIndex={dark && (piece?.color === "w" || isTarget) ? 0 : -1}
                  aria-label={piece ? `Pion ${piece.color === "w" ? "blanc" : "noir"}${piece.king ? " Dame" : ""}` : undefined}
                >
                  {isTarget && !piece && <div className="dames-dot" />}
                  {piece && (
                    <div className={["dames-piece", piece.color === "w" ? "wp" : "bp", isSel ? "sel" : ""].join(" ")}>
                      {piece.king && <span className="dames-crown">♛</span>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {status !== "playing" && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button className="btn" onClick={newGame}>Rejouer</button>
        </div>
      )}

      <p className="page-sub" style={{ marginTop: 12, fontSize: 13 }}>
        Plateau 6×6 · Prises obligatoires · Atteignez la rangée adverse pour devenir Dame
      </p>
    </div>
  );
}
