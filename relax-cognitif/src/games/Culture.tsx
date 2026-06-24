import { useMemo, useState } from "react";
import Chrono from "../components/Chrono";
import NextButton from "../components/NextButton";
import QuizResult from "../components/QuizResult";
import { useGameSession } from "../lib/useGameSession";
import { CAT_LABELS, CULTURE, shuffleOptions, type CultureCat } from "../lib/culture";

const ROUND_SIZE = 20;
const PASS = 14;
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

  const total = Math.min(ROUND_SIZE, questions.length);
  const q = questions[qi];
  const opts = useMemo(() => q ? shuffleOptions(q) : [], [q]);

  function next() {
    if (picked == null) return;
    const newScore = picked === q.a ? score + 1 : score;
    setScore(newScore);
    if (qi + 1 >= total) {
      session.record(newScore >= PASS ? "success" : "failure");
      setDone(true);
    } else {
      setQi(i => i + 1);
      setPicked(null);
    }
  }

  function restart() { setSeed(s => s + 1); }

  if (done) {
    return (
      <QuizResult
        game="culture"
        won={session.won}
        score={score}
        total={total}
        onReplay={restart}
      />
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
        <span>Question {qi + 1} / {total}</span>
      </div>

      <div className="chrono-row">
        <Chrono running={!done} resetKey={key} />
      </div>

      <div className="cult-q">{q.q}</div>

      <div className="opt-grid">
        {opts.map(opt => (
          <button
            key={opt}
            className={`opt ${picked === opt ? "chosen" : ""}`}
            onClick={() => setPicked(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      {picked != null && (
        <div style={{ textAlign: "center" }}>
          <span className="quiz-answered">Répondu</span>
        </div>
      )}

      <NextButton last={qi + 1 >= total} disabled={picked == null} onClick={next} />
    </div>
  );
}
