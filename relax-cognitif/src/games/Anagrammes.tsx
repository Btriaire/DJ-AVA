import { useMemo, useState } from "react";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { randomAnaWord, scramble, type AnaLevel } from "../lib/anagrammes";
import { useGameSession } from "../lib/useGameSession";

const LEVELS: { id: AnaLevel; label: string }[] = [
  { id: "facile", label: "Facile" },
  { id: "moyen", label: "Moyen" },
  { id: "difficile", label: "Difficile" },
];

type Tile = { id: number; letter: string };

export default function Anagrammes() {
  const [level, setLevel] = useState<AnaLevel>("facile");
  const [seed, setSeed] = useState(0);
  const session = useGameSession("anagrammes", level);

  const target = useMemo(() => randomAnaWord(level), [level, seed]);

  // lettres mélangées (banque) et lettres placées (réponse)
  const initialTiles = useMemo<Tile[]>(
    () => scramble(target.word).map((letter, i) => ({ id: i, letter })),
    [target]
  );

  const [bank, setBank] = useState<Tile[]>(initialTiles);
  const [answer, setAnswer] = useState<Tile[]>([]);
  const [abandoned, setAbandoned] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const key = `${level}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setBank(initialTiles);
    setAnswer([]);
    setAbandoned(false);
    setShowHint(false);
    session.reset();
  }

  const built = answer.map((t) => t.letter).join("");
  const solved = built === target.word;
  const finished = solved || abandoned;

  if (solved && !session.won) session.record("success");

  function pickFromBank(tile: Tile) {
    if (finished) return;
    setBank((b) => b.filter((t) => t.id !== tile.id));
    setAnswer((a) => [...a, tile]);
  }

  function returnToBank(tile: Tile) {
    if (finished) return;
    setAnswer((a) => a.filter((t) => t.id !== tile.id));
    setBank((b) => [...b, tile]);
  }

  function clearAnswer() {
    if (finished) return;
    setBank((b) => [...b, ...answer]);
    setAnswer([]);
  }

  function giveHint() {
    if (finished || !session.useHint()) return;
    setShowHint(true);
    // place la prochaine bonne lettre à sa position
    const pos = answer.length;
    if (pos >= target.word.length) return;
    const needed = target.word[pos];
    // si une lettre déjà mal placée occupe cette position, on repart proprement
    const wrongIdx = answer.findIndex((t, i) => t.letter !== target.word[i]);
    if (wrongIdx !== -1) {
      // renvoie les lettres mal placées dans la banque
      const ok = answer.slice(0, wrongIdx);
      const bad = answer.slice(wrongIdx);
      setAnswer(ok);
      setBank((b) => [...b, ...bad]);
      return;
    }
    const fromBank = bank.find((t) => t.letter === needed);
    if (fromBank) {
      setBank((b) => b.filter((t) => t.id !== fromBank.id));
      setAnswer((a) => [...a, fromBank]);
    }
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
    setShowHint(true);
  }

  return (
    <div>
      <div className="controls">
        <div className="seg">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={`seg-btn ${level === l.id ? "active" : ""}`}
              onClick={() => { setLevel(l.id); setSeed((s) => s + 1); }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setSeed((s) => s + 1)}>
          Autre mot
        </button>
      </div>

      <p className="page-sub">Remettez les lettres dans le bon ordre.</p>
      <p className="ana-hint-def">💡 {target.hint}</p>

      <div className="chrono-row">
        <Chrono running={!finished} resetKey={key} />
      </div>

      <WinReward game="anagrammes" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={solved}
        abandoned={abandoned}
      />

      {/* Zone réponse */}
      <div className={`ana-answer ${solved ? "solved" : ""}`}>
        {abandoned ? (
          target.word.split("").map((ltr, i) => (
            <span key={i} className="ana-tile placed reveal">{ltr}</span>
          ))
        ) : answer.length === 0 ? (
          <span className="ana-placeholder">Touchez les lettres ci-dessous…</span>
        ) : (
          answer.map((t) => (
            <button key={t.id} className="ana-tile placed" onClick={() => returnToBank(t)}>
              {t.letter}
            </button>
          ))
        )}
      </div>

      {/* Banque de lettres */}
      {!finished && (
        <div className="ana-bank">
          {bank.map((t) => (
            <button key={t.id} className="ana-tile" onClick={() => pickFromBank(t)}>
              {t.letter}
            </button>
          ))}
        </div>
      )}

      {!finished && answer.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="link-btn" onClick={clearAnswer}>Tout effacer</button>
        </div>
      )}

      {showHint && !finished && (
        <p className="status">Indice : le mot commence par « {target.word[0]} ».</p>
      )}

      {finished && (
        <p className={solved ? "status win" : "status"}>
          {abandoned ? `Le mot était : ${target.word}` : "Bravo, c'est le bon mot !"}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>Suivant →</button>
        </p>
      )}
    </div>
  );
}
