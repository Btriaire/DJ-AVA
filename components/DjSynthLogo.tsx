"use client";
import { setDjLive, useDjLive } from "@/lib/djLive";
import { FORCE_LABEL } from "@/lib/djForce";

// The DJ-SYNTH sign of the console: dark and quiet when the intelligent DJ is off, lit (glow, moving bars, its force)
// when it is on. A click switches the DJ on or off. Colours are explicit (this sits outside the Préparation views).
const BARS = [0.55, 0.9, 0.7, 1, 0.65, 0.85, 0.5];

export function DjSynthLogo() {
  const live = useDjLive();
  const on = live.on;
  const hot = on && !!live.action; // a move is being made right now
  return (
    <button
      type="button"
      onClick={() => setDjLive({ on: !on })}
      aria-pressed={on}
      aria-label={`Logo DJ-Synth : DJ intelligent ${on ? "actif" : "éteint"}. Cliquer pour ${on ? "l'éteindre" : "l'allumer"}.`}
      title={on ? `DJ intelligent actif (force ${live.force}, ${FORCE_LABEL[live.force]}). Cliquer pour l'éteindre.` : "DJ intelligent éteint. Cliquer pour l'allumer."}
      className="group relative w-full rounded-xl border px-2 py-2 text-left transition-colors"
      style={{
        borderColor: on ? "#e879f9" : "#3f3f46",
        background: on ? "radial-gradient(ellipse at 50% 0%, rgba(232,121,249,.28), rgba(13,13,16,.95) 70%)" : "#0d0d10",
        boxShadow: on ? `0 0 ${hot ? 28 : 16}px rgba(232,121,249,${hot ? 0.75 : 0.45}), inset 0 0 14px rgba(232,121,249,.18)` : "none",
      }}
    >
      <style>{`
        @keyframes djlogo-bar { 0%,100% { transform: scaleY(.35); } 50% { transform: scaleY(1); } }
        @keyframes djlogo-glow { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
        .djlogo-bar { transform-origin: 50% 100%; transform-box: fill-box; }
        @media (prefers-reduced-motion: no-preference) {
          .djlogo-on .djlogo-bar { animation: djlogo-bar 1.1s ease-in-out infinite; }
          .djlogo-on .djlogo-word { animation: djlogo-glow 2.4s ease-in-out infinite; }
        }
      `}</style>
      <svg viewBox="0 0 220 74" className={`block h-auto w-full ${on ? "djlogo-on" : ""}`} role="img" aria-hidden>
        <defs>
          <linearGradient id="djlogo-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f0abfc" />
            <stop offset="0.55" stopColor="#e879f9" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
          <filter id="djlogo-blur" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
        {/* the sign: glow behind, then the letters */}
        {on && (
          <text x="110" y="40" textAnchor="middle" fontSize="35" fontWeight="900" fontStyle="italic" fill="#e879f9" filter="url(#djlogo-blur)" opacity=".9" style={{ letterSpacing: "1px" }}>
            DJ-SYNTH
          </text>
        )}
        <text className="djlogo-word" x="110" y="40" textAnchor="middle" fontSize="35" fontWeight="900" fontStyle="italic" fill={on ? "url(#djlogo-g)" : "#52525b"} stroke={on ? "none" : "#27272a"} strokeWidth=".6" style={{ letterSpacing: "1px" }}>
          DJ-SYNTH
        </text>
        {/* equaliser bars */}
        <g>
          {BARS.map((h, i) => (
            <rect
              key={i}
              className="djlogo-bar"
              x={32 + i * 22}
              y={52 + (1 - h) * 14}
              width="14"
              height={14 * h}
              rx="2"
              fill={on ? "url(#djlogo-g)" : "#3f3f46"}
              style={{ animationDelay: `${i * 0.13}s` }}
            />
          ))}
        </g>
      </svg>
      <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: on ? "#f0abfc" : "#71717a" }}>
        <span>{on ? "DJ intelligent actif" : "DJ intelligent éteint"}</span>
        {on && <span className="font-mono tracking-normal">{`${live.force}/5`}</span>}
      </div>
    </button>
  );
}
