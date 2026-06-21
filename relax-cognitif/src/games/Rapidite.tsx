import { useEffect, useRef, useState } from "react";
import WinReward from "../components/WinReward";
import { useGameSession } from "../lib/useGameSession";
import { REFLEX_SHAPES, REFLEX_COLORS } from "../lib/reflexShapes";

const ROUNDS = 10;
const TARGET_R = 36; // rayon 72px → confortable sur mobile

type Mode = "entrainement" | "defi";
type Phase = "idle" | "running" | "done";
type Target = { x: number; y: number; born: number; id: number; shape: number; color: number };

export default function Rapidite() {
  const [mode, setMode] = useState<Mode>("entrainement");
  const [phase, setPhase] = useState<Phase>("idle");
  const [round, setRound] = useState(0);
  const [target, setTarget] = useState<Target | null>(null);
  const [reactions, setReactions] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const fieldRef = useRef<HTMLDivElement>(null);
  const consumedRef = useRef(false);
  const shapeStartRef = useRef(0);
  const session = useGameSession("rapidite", mode);

  // Le temps accordé se réduit au fil des cibles : on accélère progressivement.
  const timeLimit = (r: number) =>
    mode === "entrainement"
      ? Math.max(1100, 2400 - r * 95)
      : Math.max(560, 2200 - r * 185);

  // Spawner : déclenché quand target === null et phase === "running"
  useEffect(() => {
    if (phase !== "running" || target !== null) return;
    if (round >= ROUNDS) { setPhase("done"); return; }

    const fw = fieldRef.current?.clientWidth ?? 320;
    const fh = fieldRef.current?.clientHeight ?? 340;
    const margin = TARGET_R + 10;
    const x = margin + Math.random() * (fw - margin * 2);
    const y = margin + Math.random() * (fh - margin * 2);
    const born = Date.now();
    // Une nouvelle forme à chaque cible (parmi 50), couleur assortie.
    const shape = (shapeStartRef.current + round) % REFLEX_SHAPES.length;
    const color = (shapeStartRef.current + round) % REFLEX_COLORS.length;
    const t: Target = { x, y, born, id: born, shape, color };
    consumedRef.current = false;
    setTarget(t);

    const tid = setTimeout(() => {
      if (consumedRef.current) return;
      consumedRef.current = true;
      setMisses(m => m + 1);
      setTarget(null);
      setRound(r => r + 1);
    }, timeLimit(round));
    return () => clearTimeout(tid);
  }, [phase, round, target, mode]); // eslint-disable-line

  // Enregistrement résultat
  useEffect(() => {
    if (phase !== "done") return;
    session.record(reactions.length >= 7 ? "success" : "failure");
  }, [phase]); // eslint-disable-line

  function hit() {
    if (consumedRef.current || phase !== "running" || !target) return;
    consumedRef.current = true;
    const rt = Date.now() - target.born;
    setReactions(prev => [...prev, rt]);
    setTarget(null);
    setRound(r => r + 1);
  }

  function start() {
    session.reset();
    shapeStartRef.current = Math.floor(Math.random() * REFLEX_SHAPES.length);
    setRound(0);
    setReactions([]);
    setMisses(0);
    setTarget(null);
    setPhase("running");
  }

  function changeMode(m: Mode) {
    setMode(m);
    setPhase("idle");
    setRound(0);
    setTarget(null);
    setReactions([]);
    setMisses(0);
  }

  const avgMs = reactions.length
    ? Math.round(reactions.reduce((a, b) => a + b, 0) / reactions.length)
    : 0;
  const pct = Math.round((reactions.length / ROUNDS) * 100);
  const perf =
    avgMs < 300 ? "⚡ Réflexes éclair !" :
    avgMs < 500 ? "Très réactif !" :
    avgMs < 800 ? "Bel entraînement !" :
    "Continuez à pratiquer !";

  return (
    <div>
      <div className="seg seg-scroll" style={{ marginBottom: 8 }}>
        <button className={`seg-btn ${mode === "entrainement" ? "active" : ""}`} onClick={() => changeMode("entrainement")}>Entraînement</button>
        <button className={`seg-btn ${mode === "defi" ? "active" : ""}`} onClick={() => changeMode("defi")}>Défi ⚡</button>
      </div>

      <WinReward game="rapidite" show={session.won} />

      {phase === "idle" && (
        <div className="rapidite-idle">
          <div className="rapidite-idle-shapes" aria-hidden>
            {[12, 28, 44].map((s, i) => (
              <svg key={s} viewBox="0 0 100 100" width="56" height="56" style={{ animationDelay: `${i * 0.25}s` }}>
                <path d={REFLEX_SHAPES[s]} fill={REFLEX_COLORS[(s + 2) % REFLEX_COLORS.length]} />
              </svg>
            ))}
          </div>
          <p className="page-sub">
            Une nouvelle forme à chaque cible (50 au total).{" "}
            {mode === "entrainement"
              ? "Le rythme s'accélère doucement à chaque réussite."
              : "Le temps se réduit vite — restez concentré !"}
          </p>
          <button className="btn" onClick={start}>Démarrer</button>
        </div>
      )}

      {phase === "running" && (
        <>
          <p className="rapidite-counter">
            Cible {round + 1} / {ROUNDS}
            <span className="rapidite-speed">
              {Array.from({ length: Math.min(5, Math.floor(round / 2) + 1) }, (_, i) => (
                <i key={i}>⚡</i>
              ))}
            </span>
          </p>
          <div ref={fieldRef} className="rapidite-field">
            {target && (
              <button
                key={target.id}
                className="rapidite-target"
                style={{ left: target.x - TARGET_R, top: target.y - TARGET_R, width: TARGET_R * 2, height: TARGET_R * 2 }}
                onClick={hit}
                aria-label="Toucher la forme"
              >
                <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
                  <defs>
                    <radialGradient id={`rg-${target.id}`} cx="38%" cy="34%" r="75%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                      <stop offset="45%" stopColor={REFLEX_COLORS[target.color]} />
                      <stop offset="100%" stopColor={REFLEX_COLORS[target.color]} stopOpacity="0.92" />
                    </radialGradient>
                  </defs>
                  <path d={REFLEX_SHAPES[target.shape]} fill={`url(#rg-${target.id})`} stroke="rgba(0,0,0,0.18)" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </>
      )}

      {phase === "done" && (
        <div className="rapidite-result">
          <p className="rapidite-avg">{avgMs > 0 ? `${avgMs} ms` : "—"}</p>
          <p className="rapidite-avg-label">temps de réaction moyen</p>
          <div className="rapidite-stats-row">
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{reactions.length}</span>
              <span className="rapidite-stat-lbl">touchées</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{misses}</span>
              <span className="rapidite-stat-lbl">ratées</span>
            </div>
            <div className="rapidite-stat">
              <span className="rapidite-stat-val">{pct}%</span>
              <span className="rapidite-stat-lbl">précision</span>
            </div>
          </div>
          <p className="rapidite-perf">{perf}</p>
          <button className="btn" onClick={start}>Rejouer</button>
        </div>
      )}
    </div>
  );
}
