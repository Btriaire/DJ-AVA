"use client";
import { useEffect, useState } from "react";

// Animated SVG opening screen — sober, hardware-matched (near-black brushed
// metal, orange DJ / green Synth accents with LED glow). A spinning platter, a
// waveform that draws itself in, bouncing EQ bars, the wordmark and a progress
// underline. Auto-dismisses after the intro; click anywhere to skip.
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  // run once: intro ~2.4s, then fade out ~0.55s, then unmount
  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), 2400);
    const t2 = window.setTimeout(onDone, 2950);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function skip() {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(onDone, 550);
  }

  // EQ bar heights (px) — staggered animation delays give a "spectrum" bounce
  const bars = [14, 22, 34, 26, 40, 30, 18, 36, 24, 44, 28, 16];

  return (
    <div
      className={`djs-splash ${leaving ? "leaving" : ""}`}
      onClick={skip}
      role="button"
      aria-label="Entrer dans DJSynth"
    >
      <style>{splashCss}</style>

      <div className="djs-stage">
        <svg viewBox="0 0 520 320" className="djs-svg" aria-hidden="true">
          <defs>
            {/* sober accent gradient: orange → green, used for waveform + bars */}
            <linearGradient id="djsAccent" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffcc00" />
              <stop offset="100%" stopColor="#ffcc00" />
            </linearGradient>
            {/* dark platter body */}
            <radialGradient id="djsPlatter" cx="50%" cy="42%" r="65%">
              <stop offset="0%" stopColor="#1c1c21" />
              <stop offset="70%" stopColor="#0d0d10" />
              <stop offset="100%" stopColor="#070709" />
            </radialGradient>
            <filter id="djsGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ===== spinning platter (SMIL rotate around its own centre) ===== */}
          <g transform="translate(120 130)">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0"
              to="360"
              dur="3.6s"
              repeatCount="indefinite"
              additive="sum"
            />
            <circle r="78" fill="url(#djsPlatter)" stroke="#2a2a30" strokeWidth="1.5" />
            {/* grooves */}
            <circle r="66" fill="none" stroke="rgba(255,255,255,0.045)" />
            <circle r="56" fill="none" stroke="rgba(255,255,255,0.04)" />
            <circle r="46" fill="none" stroke="rgba(255,255,255,0.035)" />
            <circle r="36" fill="none" stroke="rgba(255,255,255,0.03)" />
            {/* motion-cue accent arc on the rim */}
            <circle
              className="djs-arc"
              r="72"
              fill="none"
              stroke="url(#djsAccent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="120 332"
              filter="url(#djsGlow)"
            />
            {/* centre label */}
            <circle r="22" fill="#0a0a0c" stroke="#ffcc00" strokeWidth="1.5" />
            <circle r="22" fill="none" stroke="#ffcc00" strokeOpacity="0.25" strokeWidth="6" />
            <circle r="3" fill="#e7e7ea" />
          </g>

          {/* ===== tonearm (static, subtle fade-in) ===== */}
          <g
            className="djs-arm"
            stroke="#3a3a42"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          >
            <line x1="212" y1="34" x2="150" y2="118" />
            <circle cx="212" cy="34" r="6" fill="#15151a" stroke="#3a3a42" strokeWidth="2" />
          </g>

          {/* ===== waveform that draws itself in ===== */}
          <path
            className="djs-wave"
            d="M232 130 q12 -34 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0"
            fill="none"
            stroke="url(#djsAccent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#djsGlow)"
          />

          {/* ===== EQ bars ===== */}
          <g transform="translate(232 232)">
            {bars.map((h, i) => (
              <rect
                key={i}
                className="djs-bar"
                x={i * 21}
                y={-h}
                width="11"
                height={h}
                rx="2.5"
                fill="url(#djsAccent)"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </g>
        </svg>

        {/* ===== wordmark ===== */}
        <div className="djs-word">
          <span className="djs-dj">DJ</span>
          <span className="djs-syn">Synth</span>
        </div>
        <div className="djs-tag">performance controller</div>

        {/* ===== progress underline (acts as a loading bar) ===== */}
        <div className="djs-progress">
          <span />
        </div>

        <div className="djs-skip">Cliquez pour entrer</div>
      </div>
    </div>
  );
}

const splashCss = `
.djs-splash{
  position:fixed; inset:0; z-index:200; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  background:
    radial-gradient(1200px 600px at 50% -10%, #16161b 0%, transparent 60%),
    linear-gradient(180deg, #0b0b0d 0%, #050506 100%);
  animation: djsIn .5s ease both;
}
.djs-splash.leaving{ animation: djsOut .55s ease forwards; }
@keyframes djsIn{ from{opacity:0} to{opacity:1} }
@keyframes djsOut{ to{opacity:0; transform:scale(1.015)} }

.djs-stage{ display:flex; flex-direction:column; align-items:center; gap:.2rem; }
.djs-svg{ width:min(78vw,520px); height:auto; }

.djs-arc{ opacity:0; animation: djsArc .9s ease .25s forwards; }
@keyframes djsArc{ to{ opacity:1 } }

.djs-arm{ opacity:0; animation: djsArc .7s ease .35s forwards; }

/* waveform self-draw */
.djs-wave{ stroke-dasharray:560; stroke-dashoffset:560; opacity:.95;
  animation: djsDraw 1.5s ease .3s forwards; }
@keyframes djsDraw{ to{ stroke-dashoffset:0 } }

/* EQ bars bounce (scale from the baseline) */
.djs-bar{ transform-box:fill-box; transform-origin:bottom; transform:scaleY(.15);
  animation: djsBar 1.05s ease-in-out infinite alternate; }
@keyframes djsBar{ from{ transform:scaleY(.15) } to{ transform:scaleY(1) } }

/* wordmark */
.djs-word{ margin-top:-.4rem; font-weight:900; letter-spacing:-.02em;
  font-size:clamp(34px,7vw,58px); line-height:1; display:flex; gap:.06em;
  opacity:0; animation: djsRise .7s cubic-bezier(.2,.9,.25,1) .55s forwards; }
.djs-dj{ color:#ffcc00; text-shadow:0 0 14px rgba(255,204,0,.55),0 0 30px rgba(255,204,0,.25); }
.djs-syn{ color:#ffcc00; text-shadow:0 0 14px rgba(255,204,0,.5),0 0 30px rgba(255,204,0,.22); }
@keyframes djsRise{ from{opacity:0; transform:translateY(14px)} to{opacity:1; transform:translateY(0)} }

.djs-tag{ margin-top:.5rem; font-size:clamp(9px,1.5vw,11px); font-weight:700;
  text-transform:uppercase; letter-spacing:.42em; color:#6b6b73; padding-left:.42em;
  opacity:0; animation: djsFadeUp .6s ease .9s forwards; }
@keyframes djsFadeUp{ from{opacity:0; transform:translateY(6px)} to{opacity:1; transform:translateY(0)} }

.djs-progress{ margin-top:1.1rem; width:min(46vw,240px); height:3px; border-radius:3px;
  background:rgba(255,255,255,.07); overflow:hidden;
  opacity:0; animation: djsFadeUp .5s ease .7s forwards; }
.djs-progress > span{ display:block; height:100%; width:100%; transform-origin:left;
  background:linear-gradient(90deg,#ffcc00,#ffcc00);
  box-shadow:0 0 10px rgba(255,204,0,.5);
  transform:scaleX(0); animation: djsFill 1.9s ease .6s forwards; }
@keyframes djsFill{ to{ transform:scaleX(1) } }

.djs-skip{ margin-top:.9rem; font-size:10px; letter-spacing:.2em; text-transform:uppercase;
  color:#4b4b52; opacity:0; animation: djsBlink 1.6s ease 1.6s infinite; }
@keyframes djsBlink{ 0%,100%{opacity:.25} 50%{opacity:.7} }

@media (prefers-reduced-motion: reduce){
  .djs-bar,.djs-skip{ animation:none !important; }
}
`;
