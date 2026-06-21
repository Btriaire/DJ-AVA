import { useEffect, useMemo, useRef, useState } from "react";
import { CROSSWORDS } from "../lib/crosswords";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { getConfig } from "../lib/store";
import { useGameSession } from "../lib/useGameSession";

type Dir = "across" | "down";

export default function MotsCroises() {
  const [idx, setIdx] = useState(getConfig().defaults.crosswordIdx);
  const cw = CROSSWORDS[idx % CROSSWORDS.length];
  const size = cw.size;
  const [abandoned, setAbandoned] = useState(false);
  const session = useGameSession("motscroises", cw.title);

  const blocks = useMemo(
    () => cw.solution.map((r) => r.split("").map((ch) => ch === "#")),
    [cw]
  );

  const [letters, setLetters] = useState<string[][]>(() =>
    cw.solution.map((r) => r.split("").map((ch) => (ch === "#" ? "#" : "")))
  );
  const [sel, setSelState] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const [dirView, setDirView] = useState<Dir>("across");
  const selRef = useRef(sel);
  const dirRef = useRef<Dir>("across");
  const userSelectedRef = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  function setSel(next: { r: number; c: number }) {
    selRef.current = next;
    setSelState(next);
  }

  function setDir(d: Dir) {
    dirRef.current = d;
    setDirView(d);
  }

  const cwKey = String(idx);
  const [rk, setRk] = useState(cwKey);
  if (rk !== cwKey) {
    setRk(cwKey);
    setLetters(cw.solution.map((r) => r.split("").map((ch) => (ch === "#" ? "#" : ""))));
    setSel({ r: 0, c: 0 });
    setDir("across");
    userSelectedRef.current = false;
    setAbandoned(false);
    session.reset();
  }

  // numérotation des départs de mots
  const numbers = useMemo(() => {
    const map: Record<string, number> = {};
    let n = 1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (blocks[r][c]) continue;
        const startA = (c === 0 || blocks[r][c - 1]) && c + 1 < size && !blocks[r][c + 1];
        const startD = (r === 0 || blocks[r - 1][c]) && r + 1 < size && !blocks[r + 1][c];
        if (startA || startD) map[`${r},${c}`] = n++;
      }
    }
    return map;
  }, [blocks, size]);

  const solved = letters.every((row, r) =>
    row.every((ch, c) => blocks[r][c] || ch === cw.solution[r][c])
  );

  useEffect(() => {
    if (solved) session.record("success");
  }, [solved, session]);

  function giveHint() {
    if (!session.useHint()) return;
    const sr = selRef.current;
    let tr = -1, tc = -1;
    if (!blocks[sr.r][sr.c] && letters[sr.r][sr.c] !== cw.solution[sr.r][sr.c]) {
      tr = sr.r;
      tc = sr.c;
    } else {
      outer: for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (!blocks[r][c] && letters[r][c] !== cw.solution[r][c]) {
            tr = r;
            tc = c;
            break outer;
          }
    }
    if (tr < 0) return;
    setLetters((L) => {
      const next = L.map((row) => [...row]);
      next[tr][tc] = cw.solution[tr][tc];
      return next;
    });
  }

  function abandon() {
    session.record("abandon");
    setLetters(cw.solution.map((r) => r.split("")));
    setAbandoned(true);
  }

  function selectCell(r: number, c: number) {
    if (blocks[r][c]) return;
    if (userSelectedRef.current && selRef.current.r === r && selRef.current.c === c)
      setDir(dirRef.current === "across" ? "down" : "across");
    userSelectedRef.current = true;
    setSel({ r, c });
    gridRef.current?.focus();
  }

  function advance(r: number, c: number) {
    let nr = r, nc = c;
    if (dirRef.current === "across") nc = Math.min(size - 1, c + 1);
    else nr = Math.min(size - 1, r + 1);
    if (!blocks[nr][nc]) setSel({ r: nr, c: nc });
  }

  function inputLetter(letter: string) {
    if (abandoned) return;
    const { r, c } = selRef.current;
    if (blocks[r][c]) return;
    setLetters((L) => {
      const next = L.map((row) => [...row]);
      next[r][c] = letter.toUpperCase();
      return next;
    });
    advance(r, c);
  }

  function eraseLetter() {
    const { r, c } = selRef.current;
    if (blocks[r][c]) return;
    setLetters((L) => {
      const next = L.map((row) => [...row]);
      next[r][c] = "";
      return next;
    });
  }

  function onKey(e: React.KeyboardEvent) {
    if (/^[a-zA-ZàâäéèêëîïôöùûüçÀ-ÿ]$/.test(e.key)) {
      e.preventDefault();
      inputLetter(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      eraseLetter();
    }
  }

  const activeCells = useMemo(() => {
    const set = new Set<string>();
    if (blocks[sel.r][sel.c]) return set;
    const dr = dirView === "down" ? 1 : 0;
    const dc = dirView === "across" ? 1 : 0;
    let r = sel.r, c = sel.c;
    while (r - dr >= 0 && c - dc >= 0 && !blocks[r - dr][c - dc]) { r -= dr; c -= dc; }
    while (r < size && c < size && !blocks[r][c]) { set.add(`${r},${c}`); r += dr; c += dc; }
    return set;
  }, [sel, dirView, blocks, size]);

  // définition du mot actif, à afficher dans la bulle au-dessus de la grille
  const activeClue = useMemo(() => {
    if (blocks[sel.r][sel.c]) return null;
    const tryDir = (dir: Dir) => {
      const dr = dir === "down" ? 1 : 0;
      const dc = dir === "across" ? 1 : 0;
      let r = sel.r, c = sel.c;
      while (r - dr >= 0 && c - dc >= 0 && !blocks[r - dr][c - dc]) { r -= dr; c -= dc; }
      const list = dir === "across" ? cw.across : cw.down;
      const cl = list.find((x) => x.row === r && x.col === c);
      return cl ? { dir, num: numbers[`${r},${c}`], text: cl.text } : null;
    };
    return tryDir(dirView) || tryDir(dirView === "across" ? "down" : "across");
  }, [sel, dirView, blocks, cw, numbers]);

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {CROSSWORDS.map((g, i) => (
            <button key={i} className={idx === i ? "active" : ""} onClick={() => setIdx(i)}>
              {g.title}
            </button>
          ))}
        </div>
        <button
          className="btn btn-ghost"
          onClick={() =>
            setLetters(cw.solution.map((r) => r.split("").map((ch) => (ch === "#" ? "#" : ""))))
          }
        >
          Effacer
        </button>
      </div>

      <p className={solved ? "status win" : "status"}>
        {solved
          ? "Grille complète, bravo !"
          : abandoned
          ? "Voici toutes les réponses (voir définitions ci-dessous)."
          : "Touchez une case et tapez les lettres."}
      </p>

      {!solved && !abandoned && (
        <p className="cw-dir">
          Sens : <b>{dirView === "across" ? "Horizontal ↔" : "Vertical ↕"}</b>
          {" — touchez 2 fois une case pour changer."}
        </p>
      )}

      <div className="chrono-row">
        <Chrono running={!solved && !abandoned} resetKey={cwKey} />
      </div>

      <WinReward game="motscroises" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={solved}
        abandoned={abandoned}
      />

      {!solved && !abandoned && activeClue && (
        <div className="cw-bubble">
          <span className="cw-bubble-tag">
            {activeClue.dir === "across" ? "Horizontal ↔" : "Vertical ↕"} · {activeClue.num}
          </span>
          <span className="cw-bubble-text">{activeClue.text}</span>
        </div>
      )}

      <div
        className="cw-grid"
        style={{
          gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
          ["--cw-size" as string]: size,
        }}
        tabIndex={0}
        ref={gridRef}
        onKeyDown={onKey}
      >
        {letters.map((row, r) =>
          row.map((ch, c) => {
            if (blocks[r][c]) return <div key={`${r}-${c}`} className="cw-cell block" />;
            const isSel = sel.r === r && sel.c === c;
            const inWord = activeCells.has(`${r},${c}`);
            const num = numbers[`${r},${c}`];
            const wrong = ch !== "" && ch !== cw.solution[r][c];
            return (
              <div
                key={`${r}-${c}`}
                className={`cw-cell ${isSel ? "sel" : ""} ${inWord && !isSel ? "active" : ""} ${wrong ? "wrong" : ""}`}
                onClick={() => selectCell(r, c)}
              >
                {num && <span className="cw-num">{num}</span>}
                {ch}
              </div>
            );
          })
        )}
      </div>

      <div className="kbd">
        {["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"].map((row, ri) => (
          <div className="kbd-row" key={ri}>
            {row.split("").map((ch) => (
              <button key={ch} className="kbd-key" onClick={() => inputLetter(ch)}>
                {ch}
              </button>
            ))}
            {ri === 2 && (
              <button className="kbd-key erase" aria-label="Effacer la lettre" onClick={eraseLetter}>
                ⌫
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="clues">
        <div>
          <h3>Horizontal</h3>
          {cw.across.map((cl) => (
            <p key={`a${cl.row}${cl.col}`}>
              <b>{numbers[`${cl.row},${cl.col}`]}.</b> {cl.text}
            </p>
          ))}
        </div>
        <div>
          <h3>Vertical</h3>
          {cw.down.map((cl) => (
            <p key={`d${cl.row}${cl.col}`}>
              <b>{numbers[`${cl.row},${cl.col}`]}.</b> {cl.text}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
