import { useEffect, useRef, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";

type Mode = "entrainement" | "defi";
type Phase = "idle" | "running" | "done";
type Light = "wait" | "green" | "red";
type Flash = null | "good" | "bad";

const ROUNDS: Record<Mode, number> = { entrainement: 12, defi: 16 };

export default function FeuVert() {
  const [mode, setMode] = useState<Mode>("entrainement");
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [light, setLight] = useState<Light>("wait");
  const [flash, setFlash] = useState<Flash>(null);

  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [reactions, setReactions] = useState<number[]>([]);
  const [greenHits, setGreenHits] = useState(0);   // verts touchés à temps
  const [redResist, setRedResist] = useState(0);   // rouges correctement ignorés
  const [errors, setErrors] = useState(0);         // rouge touché
  const [falseStarts, setFalseStarts] = useState(0); // touché pendant l'attente
  const [misses, setMisses] = useState(0);         // vert non touché à temps

  const consumedRef = useRef(false);
  const isGreenRef = useRef(false);
  const bornRef = useRef(0);
  const t2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const session = useGameSession("feuvert", mode);

  const total = ROUNDS[mode];
  const greenProb = mode === "entrainement" ? 0.7 : 0.6;
  const greenWindow = mode === "entrainement" ? 1500 : 1050;

  useEffect(() => {
    if (phase !== "running") return;
    if (round >= total) { setPhase("done"); return; }
    consumedRef.current = false;
    setLight("wait");
    const isGreen = Math.random() < greenProb;
    isGreenRef.current = isGreen;
    const delay = 800 + Math.random() * 1700;
    const t1 = setTimeout(() => {
      setFlash(null);
      setLight(isGreen ? "green" : "red");
      bornRef.current = Date.now();
      const hold = isGreen ? greenWindow : 700 + Math.random() * 500;
      t2Ref.current = setTimeout(() => {
        if (consumedRef.current) return;
        consumedRef.current = true;
        if (isGreenRef.current) {
          // vert manqué
          setMisses((m) => m + 1);
          setStreak(0);
          setFlash("bad");
        } else {
          // rouge correctement ignoré : bonne inhibition
          setRedResist((r) => r + 1);
          setPoints((p) => p + 60);
          setStreak((s) => { const n = s + 1; setBestStreak((b) => Math.max(b, n)); return n; });
          setFlash("good");
        }
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
    const handled = greenHits + redResist;
    const wrong = errors + falseStarts + misses;
    const ok = handled >= Math.round(total * 0.6) && wrong <= 3;
    session.record(ok ? "success" : "failure");
  }, [phase]); // eslint-disable-line

  function next() {
    setRound((r) => r + 1);
  }

  function tap() {
    if (phase !== "running" || consumedRef.current) return;
    if (light === "wait") {
      consumedRef.current = true;
      setFalseStarts((f) => f + 1);
      setStreak(0);
      setFlash("bad");
      next();
    } else if (light === "green") {
      consumedRef.current = true;
      const rt = Date.now() - bornRef.current;
      setReactions((r) => [...r, rt]);
      setGreenHits((g) => g + 1);
      const bonus = Math.max(0, Math.round(100 * (1 - rt / greenWindow)));
      setPoints((p) => p + 100 + bonus);
      setStreak((s) => { const n = s + 1; setBestStreak((b) => Math.max(b, n)); return n; });
      setFlash("good");
      next();
    } else {
      consumedRef.current = true;
      setErrors((e) => e + 1);
      setStreak(0);
      setFlash("bad");
      next();
    }
  }

  function start() {
    session.reset();
    setRound(0);
    setLight("wait");
    setFlash(null);
    setPoints(0);
    setStreak(0);
    setBestStreak(0);
    setReactions([]);
    setGreenHits(0);
    setRedResist(0);
    setErrors(0);
    setFalseStarts(0);
    setMisses(0);
    setPhase("running");
  }

  function changeMode(m: Mode) {
    setMode(m);
    setPhase("idle");
    setRound(0);
    setLight("wait");
    setFlash(null);
  }

  const avgMs = reactions.length
    ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
    : 0;
  const wrong = errors + falseStarts + misses;
  const accuracy = Math.round(((greenHits + redResist) / total) * 100);
  const perf =
    wrong > 3 ? "Touchez le vert, résistez au rouge !" :
    accuracy >= 90 && avgMs && avgMs < 450 ? "⚡ Réflexes vifs et grand sang-froid !" :
    accuracy >= 80 ? "Belle maîtrise, bravo !" :
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
            Touchez <strong>seulement quand la lanterne est verte</strong>.
            Au rouge, retenez votre geste — résistez !{" "}
            {mode === "defi" ? "Davantage de rouges et moins de temps." : "Le rythme est doux pour s'exercer."}
          </p>
          <button className="btn" onClick={start}>Démarrer</button>
        </div>
      )}

      {phase === "running" && (
        <>
          <div className="fv-hud">
            <div className="fv-hud-item">
              <span className="fv-hud-val">{points}</span>
              <span className="fv-hud-lbl">points</span>
            </div>
            <div className="fv-hud-item">
              <span className="fv-hud-val">{streak > 0 ? `🔥 ${streak}` : "—"}</span>
              <span className="fv-hud-lbl">série</span>
            </div>
            <div className="fv-hud-item">
              <span className="fv-hud-val">{round + 1}/{total}</span>
              <span className="fv-hud-lbl">tour</span>
            </div>
          </div>

          <button
            className={`fv-field fv-${light} ${flash ? `fv-flash-${flash}` : ""}`}
            onClick={tap}
            aria-label={light === "green" ? "Lanterne verte, touchez !" : light === "red" ? "Lanterne rouge, ne touchez pas" : "Attendez"}
          >
            <span className={`fv-orb fv-orb-${light}`} aria-hidden />
            <span className="fv-label">
              {light === "green" ? "TOUCHEZ !" : light === "red" ? "STOP" : "Attendez…"}
            </span>
          </button>

          <div className="fv-dots">
            {Array.from({ length: total }).map((_, i) => (
              <span key={i} className={`fv-pip ${i < round ? "fv-pip-on" : ""} ${i === round ? "fv-pip-cur" : ""}`} />
            ))}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="rapidite-result">
          <p className="rapidite-avg">{points}</p>
          <p className="rapidite-avg-label">points · précision {accuracy}%</p>
          <div className="rapidite-stats-row">
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{avgMs > 0 ? `${avgMs}` : "—"}</span>
              <span className="rapidite-stat-lbl">ms moyen</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">🔥 {bestStreak}</span>
              <span className="rapidite-stat-lbl">série max</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{wrong}</span>
              <span className="rapidite-stat-lbl">erreurs</span>
            </div>
          </div>
          <p className="rapidite-perf">{perf}</p>
          <button className="btn" onClick={start}>Rejouer</button>
        </div>
      )}
    </div>
  );
}
