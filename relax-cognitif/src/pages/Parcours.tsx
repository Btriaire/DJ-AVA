import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import Medal from "../components/Medal";
import Chrono from "../components/Chrono";
import { buildParcours, STEP_LABEL, type Step } from "../lib/parcours";
import { randomQuote } from "../lib/memoryQuotes";
import {
  getSessions,
  logSession,
  medalTier,
  successCount,
} from "../lib/store";

const LENGTH = 6;

export default function Parcours() {
  const navigate = useNavigate();
  const [seed, setSeed] = useState(0);
  const steps = useMemo(() => buildParcours(LENGTH), [seed]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | string | null>(null);
  const [results, setResults] = useState<boolean[]>([]);
  const [logged, setLogged] = useState(false);

  const key = String(seed);
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setIdx(0);
    setPicked(null);
    setResults([]);
    setLogged(false);
  }

  const finished = idx >= steps.length;
  const step = finished ? null : steps[idx];
  const score = results.filter(Boolean).length;
  const quote = useMemo(() => randomQuote(), [finished]);

  function choose(value: number | string, correct: boolean) {
    if (picked != null) return;
    setPicked(value);
    setResults((r) => [...r, correct]);
  }

  function next() {
    setPicked(null);
    setIdx((i) => i + 1);
  }

  if (finished && !logged) {
    setLogged(true);
    logSession({
      game: "parcours",
      level: `${score}/${LENGTH}`,
      outcome: score >= Math.ceil(LENGTH / 2) ? "success" : "failure",
      durationMs: 0,
      hintsUsed: 0,
      at: Date.now(),
    });
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={() => navigate("/")} aria-label="Retour à l'accueil">
          ‹ Accueil
        </button>
        <h1>Parcours de l'Esprit</h1>
      </div>

      <Trail steps={steps} idx={idx} results={results} />

      {!finished && (
        <div className="chrono-row">
          <Chrono running={picked == null} resetKey={`${seed}-${idx}`} />
        </div>
      )}

      {step && (
        <div className="parc-step">
          <p className="parc-tag">
            Étape {idx + 1} / {steps.length} · {STEP_LABEL[step.kind]}
          </p>
          <p className="page-sub">{step.prompt}</p>
          <StepBody step={step} picked={picked} onChoose={choose} />
          {picked != null && (
            <p className={results[idx] ? "status win" : "status"}>
              {results[idx] ? "Bravo, c'est exact !" : "Pas tout à fait."}{" "}
              <button className="link-btn" onClick={next}>
                {idx + 1 < steps.length ? "Étape suivante →" : "Voir le résultat →"}
              </button>
            </p>
          )}
        </div>
      )}

      {finished && (
        <Result
          score={score}
          length={steps.length}
          quote={quote}
          onRestart={() => setSeed((s) => s + 1)}
          onHome={() => navigate("/")}
        />
      )}
    </div>
  );
}

function Trail({
  steps,
  idx,
  results,
}: {
  steps: Step[];
  idx: number;
  results: boolean[];
}) {
  return (
    <div className="parc-trail" aria-hidden>
      <div className="parc-trail-line" />
      {steps.map((_, i) => {
        const state =
          i < results.length
            ? results[i]
              ? "ok"
              : "ko"
            : i === idx
            ? "now"
            : "todo";
        return (
          <span key={i} className={`parc-node ${state}`}>
            {state === "ok" ? "✓" : state === "ko" ? "·" : i + 1}
          </span>
        );
      })}
    </div>
  );
}

function StepBody({
  step,
  picked,
  onChoose,
}: {
  step: Step;
  picked: number | string | null;
  onChoose: (v: number | string, correct: boolean) => void;
}) {
  if (step.kind === "logique" || step.kind === "calcul") {
    return (
      <>
        {step.kind === "logique" ? (
          <div className="seq">
            {step.sequence.map((n, i) => (
              <div key={i} className={`seq-cell ${n === null ? "blank" : ""}`}>
                {n === null ? "?" : n}
              </div>
            ))}
          </div>
        ) : (
          <div className="parc-calcul">{step.text} = ?</div>
        )}
        <div className="opt-grid">
          {step.options.map((o) => {
            const reveal = picked != null;
            const state = !reveal
              ? ""
              : o === step.answer
              ? "good"
              : o === picked
              ? "bad"
              : "";
            return (
              <button
                key={o}
                className={`opt ${state}`}
                disabled={picked != null}
                onClick={() => onChoose(o, o === step.answer)}
              >
                {o}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (step.kind === "citation") {
    return (
      <>
        <blockquote className="cit-quote">
          {step.before}
          <span className={`cit-blank ${picked != null ? "filled" : ""}`}>
            {picked != null ? step.answer : "______"}
          </span>
          {step.after}
        </blockquote>
        {picked != null && <p className="cit-author">— {step.author}</p>}
        <div className="opt-grid">
          {step.choices.map((c) => {
            const reveal = picked != null;
            const state = !reveal
              ? ""
              : c === step.answer
              ? "good"
              : c === picked
              ? "bad"
              : "";
            return (
              <button
                key={c}
                className={`opt ${state}`}
                disabled={picked != null}
                onClick={() => onChoose(c, c === step.answer)}
              >
                {c}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  // formes
  return (
    <div className="formes-grid">
      {step.cells.map((cell, i) => {
        const reveal = picked != null;
        const isIntruder = i === step.answer;
        const state = reveal
          ? isIntruder
            ? "good"
            : i === picked
            ? "bad"
            : ""
          : "";
        return (
          <button
            key={i}
            className={`forme-cell ${state}`}
            style={{ color: cell.color }}
            disabled={picked != null}
            onClick={() => onChoose(i, isIntruder)}
            aria-label="forme"
          >
            <Icon name={cell.shape} size={40} />
          </button>
        );
      })}
    </div>
  );
}

function Result({
  score,
  length,
  quote,
  onRestart,
  onHome,
}: {
  score: number;
  length: number;
  quote: { text: string; author: string };
  onRestart: () => void;
  onHome: () => void;
}) {
  const count = successCount("parcours", getSessions());
  const tier = medalTier(count);
  const perfect = score === length;
  return (
    <div className="lcd" role="status">
      <div className="lcd-screen">
        <p className="lcd-title">{perfect ? "PARCOURS PARFAIT" : "PARCOURS TERMINÉ"}</p>
        <div className="lcd-medal">
          {tier !== "none" && <Medal tier={tier} size={88} />}
          <div>
            <p className="lcd-count">
              {score} / {length} étapes réussies
            </p>
            <p className="lcd-next">
              {count} parcours{count > 1 ? "" : ""} accompli{count > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <p className="lcd-quote">« {quote.text} »</p>
        <p className="lcd-author">— {quote.author}</p>
        <div className="parc-actions">
          <button className="btn" onClick={onRestart}>
            Nouveau parcours
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            Accueil
          </button>
        </div>
      </div>
    </div>
  );
}
