import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearSessions,
  fmtDuration,
  GAME_LABELS,
  getConfig,
  getSessions,
  saveConfig,
  statsByGame,
  type Config,
  type Difficulty,
} from "../lib/store";
import { CROSSWORDS } from "../lib/crosswords";
import { SIZES } from "../lib/sudoku";

const AUTH_KEY = "ec.admin";
const LEVELS: Difficulty[] = ["facile", "moyen", "difficile"];

function Login({ onOk }: { onOk: () => void }) {
  const [user, setUser] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (user === "Admin" && pwd === "Admin") {
      sessionStorage.setItem(AUTH_KEY, "1");
      onOk();
    } else setErr(true);
  }

  return (
    <form className="admin-login" onSubmit={submit}>
      <h2>Espace administrateur</h2>
      <input
        className="field"
        placeholder="Identifiant"
        value={user}
        onChange={(e) => setUser(e.target.value)}
        autoCapitalize="none"
      />
      <input
        className="field"
        type="password"
        placeholder="Mot de passe"
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
      />
      {err && <p className="status">Identifiants incorrects.</p>}
      <button className="btn" type="submit">Se connecter</button>
    </form>
  );
}

function Curve({ rates }: { rates: number[] }) {
  if (rates.length < 2) return <p className="page-sub">Pas encore assez de parties pour tracer une courbe.</p>;
  const w = 300, h = 90, pad = 6;
  const step = (w - pad * 2) / (rates.length - 1);
  const pts = rates
    .map((r, i) => `${pad + i * step},${h - pad - (r / 100) * (h - pad * 2)}`)
    .join(" ");
  return (
    <svg className="curve" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Courbe de réussite">
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="curve-axis" />
      <polyline points={pts} className="curve-line" />
    </svg>
  );
}

function Dashboard() {
  const sessions = useMemo(() => getSessions(), []);
  const stats = useMemo(() => statsByGame(sessions), [sessions]);
  const cumulative = useMemo(() => {
    let ok = 0;
    return sessions.map((s, i) => {
      if (s.outcome === "success") ok++;
      return Math.round((ok / (i + 1)) * 100);
    });
  }, [sessions]);

  const total = sessions.length;
  const globalSuccess = total
    ? Math.round((sessions.filter((s) => s.outcome === "success").length / total) * 100)
    : 0;

  return (
    <>
      <section className="admin-card">
        <h3>Progression globale</h3>
        <p className="page-sub">
          {total} partie{total > 1 ? "s" : ""} jouée{total > 1 ? "s" : ""} · {globalSuccess}% de réussite
        </p>
        <Curve rates={cumulative} />
      </section>

      <section className="admin-card">
        <h3>Par type de jeu</h3>
        <div className="stat-table">
          <div className="stat-head">
            <span>Jeu</span><span>Joué</span><span>Gagné</span><span>Échec</span><span>Aband.</span><span>Temps</span>
          </div>
          {stats.map((s) => (
            <div className="stat-row" key={s.game}>
              <span>{GAME_LABELS[s.game]}</span>
              <span>{s.total}</span>
              <span>{s.success}</span>
              <span>{s.failure}</span>
              <span>{s.abandon}</span>
              <span>{s.total ? fmtDuration(s.avgMs) : "—"}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState(sessionStorage.getItem(AUTH_KEY) === "1");
  const [cfg, setCfg] = useState<Config>(() => getConfig());
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(0); // forces Dashboard remount after clear

  function update(patch: Partial<Config["defaults"]>) {
    setCfg((c) => ({ ...c, defaults: { ...c.defaults, ...patch } }));
    setSaved(false);
  }

  function persist() {
    saveConfig(cfg);
    setSaved(true);
  }

  if (!authed) {
    return (
      <div className="app">
        <div className="topbar">
          <button className="back" onClick={() => navigate("/")}>‹ Accueil</button>
          <h1>Administration</h1>
        </div>
        <Login onOk={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={() => navigate("/")}>‹ Accueil</button>
        <h1>Administration</h1>
      </div>

      <section className="admin-card">
        <h3>Réglages par défaut</h3>

        <label className="cfg-label">Aides par exercice</label>
        <div className="stepper">
          <button
            className="btn btn-ghost"
            onClick={() => { setCfg((c) => ({ ...c, hintLimit: Math.max(0, c.hintLimit - 1) })); setSaved(false); }}
          >−</button>
          <span className="stepper-val">{cfg.hintLimit}</span>
          <button
            className="btn btn-ghost"
            onClick={() => { setCfg((c) => ({ ...c, hintLimit: Math.min(9, c.hintLimit + 1) })); setSaved(false); }}
          >+</button>
        </div>

        <label className="cfg-label">Sudoku — taille</label>
        <div className="seg">
          {Object.values(SIZES).map((s) => (
            <button key={s.key} className={cfg.defaults.sudokuSize === s.key ? "active" : ""} onClick={() => update({ sudokuSize: s.key })}>
              {s.label}
            </button>
          ))}
        </div>

        <label className="cfg-label">Sudoku — difficulté</label>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l} className={cfg.defaults.sudokuLevel === l ? "active" : ""} onClick={() => update({ sudokuLevel: l })}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        <label className="cfg-label">Paires de mémoire — difficulté</label>
        <div className="seg">
          {LEVELS.map((l) => (
            <button key={l} className={cfg.defaults.memoryLevel === l ? "active" : ""} onClick={() => update({ memoryLevel: l })}>
              {l.charAt(0).toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        <label className="cfg-label">Mots croisés — grille par défaut</label>
        <div className="seg">
          {CROSSWORDS.map((g, i) => (
            <button key={i} className={cfg.defaults.crosswordIdx === i ? "active" : ""} onClick={() => update({ crosswordIdx: i })}>
              {g.title}
            </button>
          ))}
        </div>

        <button className="btn" onClick={persist}>Enregistrer</button>
        {saved && <span className="saved-flag">Enregistré ✓</span>}
      </section>

      <div key={version}>
        <Dashboard />
      </div>

      <section className="admin-card">
        <button
          className="btn btn-danger"
          onClick={() => { clearSessions(); setVersion((v) => v + 1); }}
        >
          Effacer la progression
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => { sessionStorage.removeItem(AUTH_KEY); setAuthed(false); }}
        >
          Se déconnecter
        </button>
      </section>
    </div>
  );
}
