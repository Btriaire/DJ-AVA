import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import {
  AVATARS,
  addProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  objectives,
  recommendedParcours,
  switchProfile,
  updateProfile,
} from "../lib/profile";
import {
  dayStreak,
  getSessions,
  rankFor,
  totalSuccess,
} from "../lib/store";

export default function Profil() {
  const navigate = useNavigate();
  const sessions = useMemo(() => getSessions(), []);
  const stored = useMemo(() => getProfile(), []);
  const profiles = useMemo(() => listProfiles(), []);

  const [name, setName] = useState(stored.name);
  const [avatar, setAvatar] = useState(stored.avatar);

  function update(next: { name?: string; avatar?: string }) {
    const merged = { name, avatar, ...next };
    setName(merged.name);
    setAvatar(merged.avatar);
    updateProfile(stored.id, merged);
  }

  function onSwitch(id: string) {
    if (id === stored.id) return;
    switchProfile(id);
    window.location.assign("/");
  }

  function onAdd() {
    addProfile("", "🌿");
    window.location.assign("/");
  }

  function onDelete(id: string, who: string) {
    const label = who.trim() || "ce profil";
    if (!window.confirm(`Supprimer ${label} et toute sa progression ?`)) return;
    deleteProfile(id);
    window.location.assign("/");
  }

  const objs = useMemo(() => objectives(sessions), [sessions]);
  const reco = useMemo(() => recommendedParcours(sessions), [sessions]);
  const xp = totalSuccess(sessions);
  const { rank, next, into, span } = rankFor(xp);
  const pct = span ? Math.min(100, Math.round((into / span) * 100)) : 100;
  const streak = dayStreak(sessions);

  const doneCount = objs.filter((o) => o.done).length;
  const hello = name.trim() ? `Bonjour ${name.trim()} !` : "Bonjour !";

  return (
    <div className="app">
      <div className="topbar">
        <button className="back" onClick={() => navigate("/")} aria-label="Retour à l'accueil">
          ‹ Accueil
        </button>
        <h1>Mon profil</h1>
      </div>

      {/* Carte identité */}
      <section className="prof-card">
        <div className="prof-avatar" aria-hidden>{avatar}</div>
        <p className="prof-hello">{hello}</p>
        <input
          className="prof-name-input"
          type="text"
          value={name}
          maxLength={20}
          placeholder="Votre prénom"
          onChange={(e) => update({ name: e.target.value })}
          aria-label="Votre prénom"
        />
        <div className="prof-avatars" role="group" aria-label="Choisir un avatar">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`prof-avatar-btn ${avatar === a ? "active" : ""}`}
              onClick={() => update({ avatar: a })}
              aria-label={`Avatar ${a}`}
            >
              {a}
            </button>
          ))}
        </div>
      </section>

      {/* Changer de profil */}
      <section className="prof-section">
        <h2 className="section-title">Qui joue ?</h2>
        <div className="prof-switch-list">
          {profiles.map((p) => {
            const isActive = p.id === stored.id;
            return (
              <div key={p.id} className={`prof-switch ${isActive ? "active" : ""}`}>
                <button
                  className="prof-switch-main"
                  onClick={() => onSwitch(p.id)}
                  aria-label={`Choisir le profil ${p.name.trim() || "sans nom"}`}
                >
                  <span className="prof-switch-avatar" aria-hidden>{p.avatar}</span>
                  <span className="prof-switch-name">{p.name.trim() || "Sans nom"}</span>
                  {isActive && <span className="prof-switch-tag">Actif</span>}
                </button>
                {profiles.length > 1 && !isActive && (
                  <button
                    className="prof-switch-del"
                    onClick={() => onDelete(p.id, p.name)}
                    aria-label={`Supprimer le profil ${p.name.trim() || "sans nom"}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button className="btn btn-ghost prof-add-btn" onClick={onAdd}>
          ＋ Nouveau profil
        </button>
      </section>

      {/* Voie de l'Esprit */}
      <section className="prof-rank">
        <div className="prof-rank-head">
          <span className="prof-rank-name">{rank.name}</span>
          <span className="prof-rank-sub">
            {next ? `${into} / ${span} vers ${next.name}` : "Voie accomplie"}
          </span>
        </div>
        <div className="prog-bar">
          <div className="prog-bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="prof-rank-stats">
          <span className="prof-chip"><Icon name="flame" size={15} /> {streak} jour{streak > 1 ? "s" : ""} de suite</span>
          <span className="prof-chip"><Icon name="trophy" size={15} /> {xp} victoires</span>
        </div>
      </section>

      {/* Objectifs sur mesure */}
      <section className="prof-section">
        <h2 className="section-title">Mes objectifs · {doneCount}/{objs.length}</h2>
        <div className="prof-obj-list">
          {objs.map((o) => {
            const p = Math.min(100, Math.round((o.current / o.target) * 100));
            return (
              <div key={o.id} className={`prof-obj ${o.done ? "done" : ""}`}>
                <span className="prof-obj-icon" aria-hidden>
                  {o.done ? "✓" : <Icon name={o.icon} size={20} />}
                </span>
                <div className="prof-obj-main">
                  <span className="prof-obj-label">{o.label}</span>
                  <div className="prof-obj-bar">
                    <div className="prof-obj-fill" style={{ width: `${p}%` }} />
                  </div>
                </div>
                <span className="prof-obj-count">{o.current}/{o.target}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Parcours recommandé */}
      <section className="prof-section">
        <h2 className="section-title">Votre parcours du moment</h2>
        <button className="prof-reco" onClick={() => navigate("/parcours")}>
          <span className="prof-reco-icon" aria-hidden>
            <Icon name={reco.theme.icon} size={30} />
          </span>
          <span className="prof-reco-text">
            <span className="prof-reco-tag">Sur mesure · {reco.familyLabel}</span>
            <span className="prof-reco-title">{reco.theme.title}</span>
            <span className="prof-reco-desc">Choisi {reco.reason}.</span>
          </span>
          <span className="prof-reco-go" aria-hidden>›</span>
        </button>
      </section>
    </div>
  );
}
