import { useEffect, useMemo, useState } from "react";
import WinReward from "../components/WinReward";
import Chrono from "../components/Chrono";
import { useGameSession } from "../lib/useGameSession";
import { CAT_LABELS, CULTURE, shuffleOptions, type CultureCat } from "../lib/culture";

const ROUND_SIZE = 10;
const CATS: (CultureCat | "toutes")[] = ["toutes", "capitales", "villes", "depts", "rois", "presidents", "guerres"];
const CAT_UI: Record<string, string> = { toutes: "Toutes", ...CAT_LABELS };

function pickQuestions(cat: CultureCat | "toutes", n: number) {
  const pool = cat === "toutes" ? CULTURE : CULTURE.filter(q => q.cat === cat);
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

export default function Culture() {
  const [cat, setCat] = useState<CultureCat | "toutes">("toutes");
  const [seed, setSeed] = useState(0);
  const questions = useMemo(() => pickQuestions(cat, ROUND_SIZE), [cat, seed]); // eslint-disable-line
  const [qi, setQi] = useState(0); // question index
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const session = useGameSession("culture", cat);

  const key = `${cat}-${seed}`;
  const [rk, setRk] = useState(key);
  if (rk !== key) {
    setRk(key);
    setQi(0); setPicked(null); setScore(0); setDone(false);
    session.reset();
  }

  const q = questions[qi];
  const opts = useMemo(() => q ? shuffleOptions(q) : [], [q]);

  useEffect(() => {
    if (done) session.record(score >= 7 ? "success" : "failure");
  }, [done]); // eslint-disable-line

  function pick(opt: string) {
    if (picked) return;
    setPicked(opt);
    if (opt === q.a) setScore(s => s + 1);
  }

  function next() {
    if (qi + 1 >= ROUND_SIZE) { setDone(true); return; }
    setQi(i => i + 1);
    setPicked(null);
  }

  function restart() { setSeed(s => s + 1); }

  if (done) {
    const grade = score >= 9 ? "Excellent !" : score >= 7 ? "Très bien !" : score >= 5 ? "Pas mal !" : "Continuez à pratiquer !";
    return (
      <div>
        <WinReward game="culture" show={session.won} />
        <div className="cult-end">
          <p className="cult-score-big">{score} / {ROUND_SIZE}</p>
          <p className="cult-grade">{grade}</p>
          <button className="btn" onClick={restart}>Rejouer</button>
          <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { setCat("toutes"); restart(); }}>Changer de thème</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Sélecteur de catégorie */}
      <div className="seg seg-scroll" style={{ marginBottom: 4 }}>
        {CATS.map(c => (
          <button
            key={c}
            className={`seg-btn ${cat === c ? "active" : ""}`}
            onClick={() => { setCat(c); setSeed(s => s + 1); }}
          >
            {CAT_UI[c]}
          </button>
        ))}
      </div>

      <div className="cult-progress">
        <span>{qi + 1} / {ROUND_SIZE}</span>
        <span>Score : {score}</span>
      </div>

      <div className="chrono-row">
        <Chrono running={!done} resetKey={key} />
      </div>

      <WinReward game="culture" show={session.won} />

      <div className="cult-q">{q.q}</div>

      <div className="opt-grid">
        {opts.map(opt => {
          const state = picked
            ? opt === q.a ? "good" : opt === picked ? "bad" : ""
            : "";
          return (
            <button
              key={opt}
              className={`opt ${state}`}
              disabled={!!picked}
              onClick={() => pick(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {picked && (
        <div className={`cult-feedback ${picked === q.a ? "ok" : "ko"}`}>
          {picked === q.a ? "✓ Correct !" : `✗ La bonne réponse était : ${q.a}`}
          <button className="link-btn" style={{ marginLeft: 12 }} onClick={next}>
            {qi + 1 < ROUND_SIZE ? "Suivant →" : "Résultat →"}
          </button>
        </div>
      )}
    </div>
  );
}
