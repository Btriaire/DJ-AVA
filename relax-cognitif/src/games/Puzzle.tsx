import { useEffect, useMemo, useState } from "react";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { JAPAN_SCENES, JapanArt, SCENE_SIZE } from "../lib/japanScenes";
import { useGameSession } from "../lib/useGameSession";

const BOARD = 300; // largeur/hauteur en px (scènes carrées)
const SIZES = [3, 4] as const;

const LEVEL_LABELS: Record<1 | 2 | 3, string> = {
  1: "Facile",
  2: "Moyen",
  3: "Détaillé",
};

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
  const scene = JAPAN_SCENES[sceneIdx];
  const session = useGameSession("puzzle", `${scene.key} ${n}×${n}`);

  const cell = BOARD / n;

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

  // Scènes regroupées par niveau pour le sélecteur de modèle.
  const groups = useMemo(() => {
    const g: { level: 1 | 2 | 3; items: { idx: number; key: string; title: string }[] }[] = [
      { level: 1, items: [] },
      { level: 2, items: [] },
      { level: 3, items: [] },
    ];
    JAPAN_SCENES.forEach((s, idx) => {
      g[s.level - 1].items.push({ idx, key: s.key, title: s.title });
    });
    return g;
  }, []);

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
      <div className="puzzle-models">
        {groups.map((g) => (
          <div key={g.level} className="puzzle-model-group">
            <span className="puzzle-model-level">{LEVEL_LABELS[g.level]}</span>
            <div className="puzzle-thumbs">
              {g.items.map((it) => (
                <button
                  key={it.key}
                  className={`puzzle-thumb ${sceneIdx === it.idx ? "active" : ""}`}
                  onClick={() => setSceneIdx(it.idx)}
                  title={it.title}
                  aria-label={it.title}
                >
                  <JapanArt scene={JAPAN_SCENES[it.idx]} size={44} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="puzzle-scene-name">{scene.title}</p>

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
        <div className="puzzle-board" style={{ width: BOARD, height: BOARD }}>
          {board.map((tile, slot) => {
            if (tile === n * n - 1 && !isSolved) return null;
            const r = Math.floor(slot / n), c = slot % n;
            const or = Math.floor(tile / n), oc = tile % n;
            return (
              <button
                key={slot}
                className="puzzle-tile"
                style={{ left: c * cell, top: r * cell, width: cell, height: cell }}
                onClick={() => move(slot)}
                aria-label="pièce"
              >
                <JapanArt
                  scene={scene}
                  size={cell}
                  crop={{
                    x: (oc * SCENE_SIZE) / n,
                    y: (or * SCENE_SIZE) / n,
                    w: SCENE_SIZE / n,
                    h: SCENE_SIZE / n,
                  }}
                />
              </button>
            );
          })}
        </div>

        {showModel && (
          <div className="puzzle-model">
            <span className="puzzle-model-tag">Modèle</span>
            <JapanArt scene={scene} size={120} />
          </div>
        )}
      </div>
    </div>
  );
}
