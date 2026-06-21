import { useEffect, useMemo, useState } from "react";
import PixelArt from "../components/PixelArt";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { SCENES } from "../lib/pixelScenes";
import { useGameSession } from "../lib/useGameSession";

const BOARD = 300; // largeur en px
const SIZES = [3, 4] as const;

function solved(n: number): number[] {
  return Array.from({ length: n * n }, (_, i) => i);
}

function shuffle(n: number): number[] {
  const b = solved(n);
  let blank = n * n - 1;
  const moves = 120 * n;
  for (let k = 0; k < moves; k++) {
    const r = Math.floor(blank / n);
    const c = blank % n;
    const nb: number[] = [];
    if (r > 0) nb.push(blank - n);
    if (r < n - 1) nb.push(blank + n);
    if (c > 0) nb.push(blank - 1);
    if (c < n - 1) nb.push(blank + 1);
    const pick = nb[Math.floor(Math.random() * nb.length)];
    [b[blank], b[pick]] = [b[pick], b[blank]];
    blank = pick;
  }
  return b;
}

export default function Puzzle() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [n, setN] = useState<number>(3);
  const [seed, setSeed] = useState(0);
  const [showModel, setShowModel] = useState(false);
  const [moves, setMoves] = useState(0);
  const session = useGameSession("puzzle", `${SCENES[sceneIdx].key} ${n}×${n}`);

  const scene = SCENES[sceneIdx];
  const rows = scene.rows;
  const imgW = rows[0].length;
  const imgH = rows.length;
  const cellW = BOARD / n;
  const cellH = (BOARD * (imgH / imgW)) / n;

  const [board, setBoard] = useState<number[]>(() => shuffle(3));

  const key = `${sceneIdx}-${n}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setBoard(shuffle(n));
    setMoves(0);
    session.reset();
  }

  const isSolved = useMemo(() => board.every((v, i) => v === i), [board]);

  useEffect(() => {
    if (isSolved && moves > 0) session.record("success");
  }, [isSolved, moves, session]);

  function move(slot: number) {
    if (isSolved) return;
    const blank = board.indexOf(n * n - 1);
    const r1 = Math.floor(slot / n), c1 = slot % n;
    const r2 = Math.floor(blank / n), c2 = blank % n;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return;
    setBoard((b) => {
      const nb = [...b];
      [nb[slot], nb[blank]] = [nb[blank], nb[slot]];
      return nb;
    });
    setMoves((m) => m + 1);
  }

  return (
    <div>
      <div className="controls seg-scroll-wrap">
        <div className="seg seg-scroll">
          {SCENES.map((s, i) => (
            <button
              key={s.key}
              className={sceneIdx === i ? "active" : ""}
              onClick={() => setSceneIdx(i)}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      <div className="controls">
        <div className="seg">
          {SIZES.map((s) => (
            <button key={s} className={n === s ? "active" : ""} onClick={() => setN(s)}>
              {s}×{s}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" onClick={() => setSeed((x) => x + 1)}>
          Mélanger
        </button>
        <button
          className={`btn btn-ghost ${showModel ? "active" : ""}`}
          onClick={() => setShowModel((v) => !v)}
        >
          Modèle
        </button>
      </div>

      <p className={isSolved ? "status win" : "status"}>
        {isSolved ? `Image reconstituée en ${moves} coups !` : `Coups : ${moves}`}
      </p>

      <div className="chrono-row">
        <Chrono running={!isSolved} resetKey={key} />
      </div>

      <WinReward game="puzzle" show={session.won} />

      <div className="puzzle-wrap">
        <div
          className="puzzle-board"
          style={{ width: BOARD, height: cellH * n }}
        >
          {board.map((tile, slot) => {
            if (tile === n * n - 1 && !isSolved) return null;
            const r = Math.floor(slot / n), c = slot % n;
            const or = Math.floor(tile / n), oc = tile % n;
            return (
              <button
                key={slot}
                className="puzzle-tile"
                style={{
                  left: c * cellW,
                  top: r * cellH,
                  width: cellW,
                  height: cellH,
                }}
                onClick={() => move(slot)}
                aria-label="pièce"
              >
                <PixelArt
                  rows={rows}
                  size={cellW}
                  crop={{
                    x: (oc * imgW) / n,
                    y: (or * imgH) / n,
                    w: imgW / n,
                    h: imgH / n,
                  }}
                />
              </button>
            );
          })}
        </div>

        {showModel && (
          <div className="puzzle-model">
            <span className="puzzle-model-tag">Modèle</span>
            <PixelArt rows={rows} size={120} />
          </div>
        )}
      </div>
    </div>
  );
}
