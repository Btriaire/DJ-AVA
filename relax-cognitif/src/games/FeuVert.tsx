import { useEffect, useRef, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";

const ROUNDS = 12;

type Mode = "entrainement" | "defi";
type Phase = "idle" | "running" | "done";
type Light = "wait" | "green" | "red";

export default function FeuVert() {
  const [mode, setMode] = useState<Mode>("entrainement");
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [light, setLight] = useState<Light>("wait");
  const [reactions, setReactions] = useState<number[]>([]);
  const [errors, setErrors] = useState(0); // touché un feu rouge
  const [falseStarts, setFalseStarts] = useState(0); // touché trop tôt
  const consumedRef = useRef(false);
  const bornRef = useRef(0);
  const t2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useGameSession("feuvert", mode);

  // Probabilité de feu vert ; en défi, plus de rouges (inhibition) et fenêtre plus courte.
  const greenProb = mode === "entrainement" ? 0.74 : 0.62;
  const greenWindow = mode === "entrainement" ? 1500 : 1050;

  useEffect(() => {
    if (phase !== "running") return;
    if (round >= ROUNDS) { setPhase("done"); return; }
    consumedRef.current = false;
    setLight("wait");
    const isGreen = Math.random() < greenProb;
    const delay = 700 + Math.random() * 1600;
    const t1 = setTimeout(() => {
      setLight(isGreen ? "green" : "red");
      bornRef.current = Date.now();
      const hold = isGreen ? greenWindow : 650 + Math.random() * 500;
      t2Ref.current = setTimeout(() => {
        if (consumedRef.current) return;
        consumedRef.current = true;
        // vert non touché ou rouge correctement ignoré : on passe au tour suivant
        next();
      }, hold);
    }, delay);
    return () => {
      clearTimeout(t1);
      if (t2Ref.current) clearTimeout(t2Ref.current);
    };
  }, [phase, round]); // eslint-disable-line

  useEffect(() => {
    if (phase !== "done") return;
    const ok = reactions.length >= 7 && errors + falseStarts <= 3;
    session.record(ok ? "success" : "failure");
  }, [phase]); // eslint-disable-line

  function next() {
    setLight("wait");
    setRound(r => r + 1);
  }

  function tap() {
    if (phase !== "running" || consumedRef.current) return;
    if (light === "wait") {
      consumedRef.current = true;
      setFalseStarts(f => f + 1);
      next();
    } else if (light === "green") {
      consumedRef.current = true;
      setReactions(r => [...r, Date.now() - bornRef.current]);
      next();
    } else {
      consumedRef.current = true;
      setErrors(e => e + 1);
      next();
    }
  }

  function start() {
    session.reset();
    setRound(0);
    setReactions([]);
    setErrors(0);
    setFalseStarts(0);
    setLight("wait");
    setPhase("running");
  }

  function changeMode(m: Mode) {
    setMode(m);
    setPhase("idle");
    setRound(0);
    setLight("wait");
    setReactions([]);
    setErrors(0);
    setFalseStarts(0);
  }

  const avgMs = reactions.length
    ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
    : 0;
  const perf =
    errors + falseStarts > 3 ? "Attention à ne toucher que le vert !" :
    avgMs < 350 ? "⚡ Réflexes éclair et bon contrôle !" :
    avgMs < 550 ? "Très réactif et précis !" :
    "Bel entraînement, continuez !";

  return (
    <div>
      <div className="seg seg-scroll" style={{ marginBottom: 8 }}>
        <button className={`seg-btn ${mode === "entrainement" ? "active" : ""}`} onClick={() => changeMode("entrainement")}>Entraînement</button>
        <button className={`seg-btn ${mode === "defi" ? "active" : ""}`} onClick={() => changeMode("defi")}>Défi ⚡</button>
      </div>

      <WinReward game="feuvert" show={session.won} />

      {phase === "idle" && (
        <div className="rapidite-idle">
          <div className="fv-lights-demo" aria-hidden>
            <span className="fv-dot fv-green" />
            <span className="fv-dot fv-red" />
          </div>
          <p className="page-sub">
            Touchez l'écran <strong>seulement quand le rond est vert</strong>.
            Au rouge, ne touchez pas — résistez ! {mode === "defi" ? "Plus de rouges et moins de temps." : "Le rythme est doux pour s'exercer."}
          </p>
          <button className="btn" onClick={start}>Démarrer</button>
        </div>
      )}

      {phase === "running" && (
        <>
          <p className="rapidite-counter">Tour {round + 1} / {ROUNDS}</p>
          <button
            className={`fv-field fv-${light}`}
            onClick={tap}
            aria-label={light === "green" ? "Feu vert, touchez !" : light === "red" ? "Feu rouge, ne touchez pas" : "Attendez"}
          >
            <span className="fv-label">
              {light === "green" ? "TOUCHEZ !" : light === "red" ? "STOP" : "Attendez…"}
            </span>
          </button>
        </>
      )}

      {phase === "done" && (
        <div className="rapidite-result">
          <p className="rapidite-avg">{avgMs > 0 ? `${avgMs} ms` : "—"}</p>
          <p className="rapidite-avg-label">temps de réaction moyen</p>
          <div className="rapidite-stats-row">
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{reactions.length}</span>
              <span className="rapidite-stat-lbl">verts touchés</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{errors}</span>
              <span className="rapidite-stat-lbl">rouges touchés</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{falseStarts}</span>
              <span className="rapidite-stat-lbl">trop tôt</span>
            </div>
          </div>
          <p className="rapidite-perf">{perf}</p>
          <button className="btn" onClick={start}>Rejouer</button>
        </div>
      )}
    </div>
  );
}
