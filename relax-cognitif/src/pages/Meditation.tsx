import { useState } from "react";
import Icon from "../components/Icon";

// Base des fichiers audio hébergés sur ton VPS.
// Définis VITE_MEDIA_BASE dans .env (ex: https://media.ton-vps.fr/meditation)
const MEDIA_BASE = import.meta.env.VITE_MEDIA_BASE ?? "/media/meditation";

type Session = { id: string; title: string; desc: string; minutes: number; file: string };

const SESSIONS: Session[] = [
  { id: "respiration", title: "Respiration calme", desc: "Pour se poser en douceur", minutes: 5, file: "respiration-5min.mp3" },
  { id: "balayage", title: "Détente du corps", desc: "Relâcher chaque muscle", minutes: 10, file: "balayage-10min.mp3" },
  { id: "soir", title: "Avant de dormir", desc: "S'endormir paisiblement", minutes: 12, file: "soir-12min.mp3" },
];

export default function Meditation() {
  const [active, setActive] = useState<Session | null>(null);
  const [error, setError] = useState(false);

  return (
    <div>
      <p className="page-sub">Installez-vous confortablement et choisissez une séance.</p>

      <div className="med-list">
        {SESSIONS.map((s) => (
          <button
            key={s.id}
            className={`med-item ${active?.id === s.id ? "active" : ""}`}
            onClick={() => {
              setActive(s);
              setError(false);
            }}
          >
            <span className="med-icon" aria-hidden><Icon name="leaf" size={30} /></span>
            <span className="med-body">
              <span className="med-title">{s.title}</span>
              <span className="med-desc">{s.desc}</span>
            </span>
            <span className="med-min">{s.minutes} min</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="panel med-player">
          <h3 style={{ marginTop: 0 }}>{active.title}</h3>
          {error ? (
            <p className="status">
              Audio indisponible. Dépose <code>{active.file}</code> dans <code>{MEDIA_BASE}</code> sur le VPS.
            </p>
          ) : (
            <audio
              controls
              autoPlay
              style={{ width: "100%" }}
              src={`${MEDIA_BASE}/${active.file}`}
              onError={() => setError(true)}
            />
          )}
        </div>
      )}
    </div>
  );
}
