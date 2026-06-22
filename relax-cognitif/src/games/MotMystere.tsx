import { useEffect, useMemo, useState } from "react";
import GameActions from "../components/GameActions";
import WinReward from "../components/WinReward";
import {
  AZERTY_ROWS,
  evaluateGuess,
  keyboardStatuses,
  randomMMWord,
  REGISTER_LABEL,
  type LetterStatus,
  type MMRegister,
} from "../lib/motMystere";
import { useGameSession } from "../lib/useGameSession";

const MAX_ROWS = 6;
const REGISTERS: MMRegister[] = ["courant", "soutenu"];

export default function MotMystere() {
  const [register, setRegister] = useState<MMRegister>("courant");
  const [seed, setSeed] = useState(0);
  const session = useGameSession("motmystere", register);

  const target = useMemo(() => randomMMWord(register), [register, seed]);
  const word = target.word;

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState(word[0]);
  const [showDef, setShowDef] = useState(false);
  const [shake, setShake] = useState(false);
  const [abandoned, setAbandoned] = useState(false);

  const won = guesses.includes(word);
  const outOfRows = !won && guesses.length >= MAX_ROWS;
  const lost = outOfRows || abandoned;
  const finished = won || lost;

  // Réinitialise à chaque nouveau mot / registre.
  const key = `${register}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setGuesses([]);
    setCurrent(word[0]);
    setShowDef(false);
    setShake(false);
    setAbandoned(false);
    session.reset();
  }

  if (won && !session.won) session.record("success");
  useEffect(() => {
    if (outOfRows) session.record("failure");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRows]);

  const kbStatus = useMemo(() => keyboardStatuses(guesses, word), [guesses, word]);

  function typeLetter(ch: string) {
    if (finished) return;
    setCurrent((c) => (c.length < word.length ? c + ch : c));
  }

  function backspace() {
    if (finished) return;
    setCurrent((c) => (c.length > 1 ? c.slice(0, -1) : c)); // garde la 1re lettre
  }

  function submit() {
    if (finished || current.length !== word.length) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    setGuesses((g) => [...g, current]);
    setCurrent(word[0]);
  }

  // Clavier physique (confort sur ordinateur).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (finished) return;
      if (e.key === "Enter") submit();
      else if (e.key === "Backspace") backspace();
      else if (/^[a-zA-Zàâäéèêëîïôöùûüç]$/.test(e.key)) {
        const up = e.key.toUpperCase();
        const norm = up.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (/^[A-Z]$/.test(norm)) typeLetter(norm);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, current, word]);

  function giveHint() {
    if (finished || !session.useHint()) return;
    if (!showDef) {
      setShowDef(true); // 1er indice : la définition
      return;
    }
    // indices suivants : révèle la prochaine bonne lettre dans la ligne
    setCurrent((c) => {
      if (c.length >= word.length) return c;
      // ne complète que si le préfixe actuel est correct
      for (let i = 1; i < c.length; i++) if (c[i] !== word[i]) return c;
      return c + word[c.length];
    });
  }

  function abandon() {
    session.record("abandon");
    setAbandoned(true);
    setShowDef(true);
  }

  const rows = Array.from({ length: MAX_ROWS }, (_, r) => r);

  return (
    <div className="mtm">
      <div className="controls">
        <div className="seg">
          {REGISTERS.map((r) => (
            <button
              key={r}
              className={`seg-btn ${register === r ? "active" : ""}`}
              onClick={() => {
                setRegister(r);
                setSeed((s) => s + 1);
              }}
            >
              {REGISTER_LABEL[r]}
            </button>
          ))}
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setSeed((s) => s + 1)}>
          Autre mot
        </button>
      </div>

      <p className="page-sub">
        Devinez le mot de {word.length} lettres. La 1<sup>re</sup> lettre est donnée.
      </p>

      <WinReward game="motmystere" show={session.won} />

      <GameActions
        hintsLeft={session.hintsLeft}
        hintLimit={session.hintLimit}
        onHint={giveHint}
        onAbandon={abandon}
        finished={won}
        abandoned={lost}
      />

      {showDef && (
        <p className="mtm-def">
          <span className="mtm-def-tag">Définition</span> {target.def}
        </p>
      )}

      {/* Grille */}
      <div className={`mtm-grid ${shake ? "mtm-shake" : ""}`}>
        {rows.map((r) => {
          const submitted = r < guesses.length;
          const isCurrent = !finished && r === guesses.length;
          const guess = submitted ? guesses[r] : isCurrent ? current : "";
          const ev: LetterStatus[] | null = submitted && guess ? evaluateGuess(guess, word) : null;
          return (
            <div
              className="mtm-row"
              key={r}
              style={{ gridTemplateColumns: `repeat(${word.length}, 1fr)` }}
            >
              {Array.from({ length: word.length }, (_, c) => {
                const ch = guess[c] ?? "";
                const status = ev ? ev[c] : "";
                const firstHint = !ch && c === 0 && (isCurrent || (!submitted && r > guesses.length));
                return (
                  <div
                    key={c}
                    className={`mtm-cell ${status ? `mtm-${status}` : ""} ${ch ? "filled" : ""} ${
                      firstHint ? "mtm-firsthint" : ""
                    }`}
                  >
                    {ch || (firstHint ? word[0] : "")}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Fin de partie */}
      {finished && (
        <p className={won ? "status win" : "status"}>
          {won ? "Bravo, c'est le bon mot !" : `Le mot était : ${word}`}{" "}
          <button className="link-btn" onClick={() => setSeed((s) => s + 1)}>
            Suivant →
          </button>
        </p>
      )}

      {/* Clavier AZERTY */}
      {!finished && (
        <div className="mtm-keyboard">
          {AZERTY_ROWS.map((rowKeys, i) => (
            <div className="mtm-kbrow" key={i}>
              {i === 2 && (
                <button className="mtm-key mtm-key-wide" onClick={submit} aria-label="Valider">
                  Entrée
                </button>
              )}
              {rowKeys.map((k) => (
                <button
                  key={k}
                  className={`mtm-key ${kbStatus[k] ? `mtm-${kbStatus[k]}` : ""}`}
                  onClick={() => typeLetter(k)}
                >
                  {k}
                </button>
              ))}
              {i === 2 && (
                <button className="mtm-key mtm-key-wide" onClick={backspace} aria-label="Effacer">
                  ⌫
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
