import { useEffect, useState } from "react";

const KEY = "ec.splash.seen";

export default function Splash() {
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; }
  });
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (hidden) return;
    const t = setTimeout(dismiss, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden]);

  function dismiss() {
    if (leaving) return;
    setLeaving(true);
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setTimeout(() => setHidden(true), 650);
  }

  if (hidden) return null;

  // Pétales de sakura qui tombent (positions + délais variés).
  const petals = [
    { left: "12%", delay: "0s", dur: "3.2s", size: 14 },
    { left: "26%", delay: "0.8s", dur: "3.8s", size: 10 },
    { left: "44%", delay: "0.3s", dur: "3.4s", size: 12 },
    { left: "61%", delay: "1.1s", dur: "4.1s", size: 9 },
    { left: "74%", delay: "0.5s", dur: "3.6s", size: 13 },
    { left: "88%", delay: "1.4s", dur: "3.9s", size: 11 },
  ];

  return (
    <div
      className={`splash ${leaving ? "leaving" : ""}`}
      onClick={dismiss}
      role="button"
      aria-label="Entrer dans l'application"
    >
      <div className="splash-scene">
        <svg viewBox="0 0 400 320" className="splash-art" aria-hidden>
          <defs>
            <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f6e7d6" />
              <stop offset="55%" stopColor="#f3ddd0" />
              <stop offset="100%" stopColor="#e7efe5" />
            </linearGradient>
            <radialGradient id="sp-sun" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f7d98a" />
              <stop offset="70%" stopColor="#eab44a" />
              <stop offset="100%" stopColor="#eab44a" stopOpacity="0.25" />
            </radialGradient>
            <linearGradient id="sp-fuji" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5fa98c" />
              <stop offset="100%" stopColor="#3d7d68" />
            </linearGradient>
          </defs>

          <rect x="0" y="0" width="400" height="320" fill="url(#sp-sky)" />

          {/* Soleil levant */}
          <circle className="sp-sun" cx="200" cy="150" r="50" fill="url(#sp-sun)" />

          {/* Collines lointaines */}
          <path className="sp-hill" d="M0,250 Q90,210 180,238 Q280,268 400,232 L400,320 L0,320 Z" fill="#cfe0d2" />

          {/* Mont Fuji */}
          <g className="sp-fuji">
            <path d="M40,278 Q130,150 200,70 Q270,150 360,278 Z" fill="url(#sp-fuji)" />
            {/* Calotte neigeuse */}
            <path d="M168,118 Q200,92 232,118 L222,128 L214,116 L206,130 L198,114 L190,128 L182,116 L174,128 Z" fill="#f4f8f4" />
          </g>

          {/* Eau / vagues douces (style seigaiha simplifié) */}
          <g className="sp-waves" opacity="0.7">
            <path d="M0,292 Q40,280 80,292 T160,292 T240,292 T320,292 T400,292" fill="none" stroke="#9cc3ad" strokeWidth="3" strokeLinecap="round" />
            <path d="M0,304 Q40,294 80,304 T160,304 T240,304 T320,304 T400,304" fill="none" stroke="#bcd8c5" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>

        {petals.map((p, i) => (
          <span
            key={i}
            className="sp-petal"
            style={{
              left: p.left,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.dur,
            }}
          />
        ))}
      </div>

      <div className="splash-text">
        <h1 className="splash-title">Esprit Clair</h1>
        <p className="splash-sub">Entretenez votre esprit, en douceur</p>
      </div>
    </div>
  );
}
