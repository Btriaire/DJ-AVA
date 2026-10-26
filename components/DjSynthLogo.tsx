"use client";
import { setDjLive, useDjLive } from "@/lib/djLive";
import { FORCE_LABEL } from "@/lib/djForce";

// The DJ-SYNTH sign of the console. Grey when the intelligent DJ does nothing (switched off, or on but waiting: no stem
// in use and no move just made); neon orange, glowing, with moving bars, only while it really works: a move was just
// made, or the stems of a song are in use. A click switches the DJ on or off. Colours are explicit (this sits outside
// the Préparation views).
const BARS = [0.55, 0.9, 0.7, 1, 0.65, 0.85, 0.5];

export function DjSynthLogo() {
  const live = useDjLive();
  const on = live.on;
  const hot = on && !!live.action; // a move is being made right now
  const lit = on && (hot || live.stems > 0); // really at work
  const state = !on ? "éteint" : lit ? "en action" : "en veille";
  return (
    <button
      type="button"
      onClick={() => setDjLive({ on: !on })}
      aria-pressed={on}
      aria-label={`Logo DJ-Synth : DJ intelligent ${state}. Cliquer pour ${on ? "l'éteindre" : "l'allumer"}.`}
      title={on ? `DJ intelligent ${state} (force ${live.force}, ${FORCE_LABEL[live.force]}). Cliquer pour l'éteindre.` : "DJ intelligent éteint. Cliquer pour l'allumer."}
      className="group relative mx-auto block w-[78%] min-w-[96px] max-w-[170px] rounded-lg border px-1.5 py-1 text-left transition-colors"
      style={{
        borderColor: lit ? "#ff7a1a" : "#3f3f46",
        background: lit ? "radial-gradient(ellipse at 50% 0%, rgba(255,106,0,.30), rgba(13,13,16,.96) 72%)" : "#0d0d10",
        boxShadow: lit ? `0 0 ${hot ? 24 : 14}px rgba(255,106,0,${hot ? 0.8 : 0.5}), inset 0 0 12px rgba(255,106,0,.2)` : "none",
        transition: "box-shadow .5s, border-color .5s, background .5s",
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
      <svg viewBox="0 0 220 74" className={`block h-auto w-full ${lit ? "djlogo-on" : ""}`} role="img" aria-hidden>
        <defs>
          <linearGradient id="djlogo-g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ffb347" />
            <stop offset="0.5" stopColor="#ff7a1a" />
            <stop offset="1" stopColor="#ff4d00" />
          </linearGradient>
          <filter id="djlogo-blur" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>
        {/* the sign: glow behind, then the letters */}
        {lit && (
          <text x="110" y="40" textAnchor="middle" fontSize="35" fontWeight="900" fontStyle="italic" fill="#ff6a00" filter="url(#djlogo-blur)" opacity=".95" style={{ letterSpacing: "1px" }}>
            DJ-SYNTH
          </text>
        )}
        <text className="djlogo-word" x="110" y="40" textAnchor="middle" fontSize="35" fontWeight="900" fontStyle="italic" fill={lit ? "url(#djlogo-g)" : on ? "#71717a" : "#52525b"} stroke={lit ? "none" : "#27272a"} strokeWidth=".6" style={{ letterSpacing: "1px" }}>
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
              fill={lit ? "url(#djlogo-g)" : "#3f3f46"}
              style={{ animationDelay: `${i * 0.13}s` }}
            />
          ))}
        </g>
      </svg>
      <div className="mt-0.5 flex items-center justify-between gap-2 px-0.5 text-[9px] font-black uppercase tracking-[0.14em]" style={{ color: lit ? "#ff9d4d" : "#71717a" }}>
        <span>{on ? `DJ ${state}` : "DJ éteint"}</span>
        {on && <span className="font-mono tracking-normal">{`${live.force}/5`}</span>}
      </div>
    </button>
  );
}
