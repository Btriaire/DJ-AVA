import { useMemo, useState } from "react";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";
import { CATEGORIES, buildGrid, pickWords, type Category } from "../lib/motsMeles";

const SIZE = 9;
const MAX_WORDS = 6;

type Cell = { r: number; c: number };

function cellKey(r: number, c: number) {
  return `${r},${c}`;
}

export default function MotsMeles() {
  const [catId, setCatId] = useState<string>(CATEGORIES[0].id);
  const [seed, setSeed] = useState(0);
  const category = useMemo<Category>(
    () => CATEGORIES.find((c) => c.id === catId) ?? CATEGORIES[0],
    [catId]
  );
  const session = useGameSession("motsmeles", catId);

  // Construit la grille avec les mots effectivement placés
  const { grid, words } = useMemo(() => {
    const picked = pickWords(category, MAX_WORDS);
    const { grid, placed } = buildGrid(picked, SIZE);
    return { grid, words: placed };
  }, [category, seed]);

  const [found, setFound] = useState<string[]>([]);
  const [path, setPath] = useState<Cell[]>([]);
  const [abandoned, setAbandoned] = useState(false);
  const [hintCells, setHintCells] = useState<Set<string>>(new Set());

  const key = `${catId}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setFound([]);
    setPath([]);
    setAbandoned(false);
    setHintCells(new Set());
    session.reset();
  }

  const solved = found.length === words.length && words.length > 0;
  const finished = solved || abandoned;

  if (solved && !session.won) session.record("success");

  // Cellules déjà validées (mots trouvés) — recalculées à partir des mots trouvés
  const foundCells = useMemo(() => {
    const set = new Set<string>();
    for (const w of found) {
      const cells = locateWord(grid, w);
      if (cells) cells.forEach((c) => set.add(cellKey(c.r, c.c)));
    }
    return set;
  }, [found, grid]);

  function tapCell(r: number, c: number) {
    if (finished) return;
    const k = cellKey(r, c);
    const idx = path.findIndex((p) => p.r === r && p.c === c);
    if (idx !== -1) {
      // re-tap : retire cette case et les suivantes
      setPath(path.slice(0, idx));
      return;
    }
    const next = [...path, { r, c }];
    setPath(next);

    // tente de valider dès qu'on a au moins 2 cases alignées
    const letters = next.map((p) => grid[p.r][p.c]).join("");
    const reversed = [...letters].reverse().join("");
    const match = words.find(
      (w) => !found.includes(w) && (w === letters || w === reversed)
    );
    if (match && isStraightLine(next)) {
      setFound((f) => [...f, match]);
      setPath([]);
      setHintCells(new Set());
    } else if (!isStraightLine(next)) {
      // direction non rectiligne : on repart de la dernière case
      setPath([{ r, c }]);
    }
    void k;
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    const remaining = words.filter((w) => !found.includes(w));
    if (!remaining.length) return;
    const w = remaining[0];
    const cells = locateWord(grid, w);
    if (cells) setHintCells(new Set([cellKey(cells[0].r, cells[0].c)]));
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
    setPath([]);
  }

  const pathSet = new Set(path.map((p) => cellKey(p.r, p.c)));

  // Pour l'abandon : révèle toutes les cellules des mots
  const revealCells = useMemo(() => {
    if (!abandoned) return new Set<string>();
    const set = new Set<string>();
    for (const w of words) {
      const cells = locateWord(grid, w);
      if (cells) cells.forEach((c) => set.add(cellKey(c.r, c.c)));
    }
    return set;
  }, [abandoned, words, grid]);

  return (
    <div>
      <div className="controls">
        <div className="mm-cats">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`seg-btn ${catId === c.id ? "active" : ""}`}
              onClick={() => { setCatId(c.id); setSeed((s) => s + 1); }}
            >
              {c.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setSeed((s) => s + 1)}>
          Autre grille
        </button>
      </div>

      <p className="page-sub">Trouvez tous les mots cachés en touchant les lettres.</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="motsmeles" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={solved}
        abandoned={abandoned}
      />

      <div className="mm-grid" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {grid.map((row, r) =>
          row.map((ltr, c) => {
            const k = cellKey(r, c);
            const cls = [
              "mm-cell",
              foundCells.has(k) ? "found" : "",
              pathSet.has(k) ? "active" : "",
              hintCells.has(k) ? "hint" : "",
              revealCells.has(k) ? "reveal" : "",
            ].join(" ");
            return (
              <button key={k} className={cls} onClick={() => tapCell(r, c)} disabled={finished}>
                {ltr}
              </button>
            );
          })
        )}
      </div>

      <div className="mm-words">
        {words.map((w) => (
          <span key={w} className={`mm-word ${found.includes(w) ? "done" : ""}`}>
            {w}
          </span>
        ))}
      </div>

      {finished && (
        <p className={solved ? "status win" : "status"}>
          {abandoned ? "Les mots sont révélés." : "Bravo, tous les mots trouvés !"}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>Nouvelle grille →</button>
        </p>
      )}
    </div>
  );
}

// ── Helpers géométrie ──────────────────────────────────────────────
function isStraightLine(cells: Cell[]): boolean {
  if (cells.length < 2) return true;
  const dr = cells[1].r - cells[0].r;
  const dc = cells[1].c - cells[0].c;
  // direction doit être l'une des 8 voisines (pas immobile)
  if (dr === 0 && dc === 0) return false;
  if (Math.abs(dr) > 1 || Math.abs(dc) > 1) return false;
  for (let i = 1; i < cells.length; i++) {
    if (cells[i].r - cells[i - 1].r !== dr) return false;
    if (cells[i].c - cells[i - 1].c !== dc) return false;
  }
  return true;
}

// Retrouve les cellules d'un mot dans la grille (toutes directions)
const DIRS = [
  [0, 1], [0, -1], [1, 0], [-1, 0],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];
function locateWord(grid: string[][], word: string): Cell[] | null {
  const size = grid.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] !== word[0]) continue;
      for (const [dr, dc] of DIRS) {
        const cells: Cell[] = [{ r, c }];
        let ok = true;
        for (let i = 1; i < word.length; i++) {
          const nr = r + dr * i;
          const nc = c + dc * i;
          if (nr < 0 || nr >= size || nc < 0 || nc >= size || grid[nr][nc] !== word[i]) {
            ok = false;
            break;
          }
          cells.push({ r: nr, c: nc });
        }
        if (ok) return cells;
      }
    }
  }
  return null;
}
