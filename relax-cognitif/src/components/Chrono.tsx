import { useEffect, useRef, useState } from "react";

function pol(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function arc(cx: number, cy: number, r: number, d0: number, d1: number): string {
  const [x0, y0] = pol(cx, cy, r, d0);
  const [x1, y1] = pol(cx, cy, r, d1);
  const large = (d1 - d0) % 360 > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export default function Chrono({
  running,
  resetKey,
}: {
  running: boolean;
  resetKey: string | number;
}) {
  const [ms, setMs] = useState(0);
  const accRef = useRef(0);
  const startRef = useRef(Date.now());

  const [rk, setRk] = useState(resetKey);
  if (rk !== resetKey) {
    setRk(resetKey);
    accRef.current = 0;
    startRef.current = Date.now();
    setMs(0);
  }

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - accRef.current;
    const id = setInterval(() => {
      const e = Date.now() - startRef.current;
      accRef.current = e;
      setMs(e);
    }, 250);
    return () => clearInterval(id);
  }, [running, rk]);

  const total = Math.floor(ms / 1000);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  const label = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  const sweep = (ms % 60000) / 60000;
  const [hx, hy] = pol(50, 50, 38, sweep * 360);

  return (
    <div className={`chrono ${running ? "run" : "stop"}`} role="timer" aria-label={`Temps écoulé ${label}`}>
      <svg className="chrono-enso" viewBox="0 0 100 100" width="40" height="40" aria-hidden>
        {/* cercle ensō tracé au pinceau, ouvert en haut */}
        <path
          d={arc(50, 50, 38, 28, 332)}
          fill="none"
          stroke="var(--gb-darkest)"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.28"
        />
        {/* progression de la seconde, balayage vert */}
        {sweep > 0.001 && (
          <path
            d={arc(50, 50, 38, 0, Math.max(0.5, sweep * 360))}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="5"
            strokeLinecap="round"
          />
        )}
        {/* point hinomaru en tête de balayage */}
        <circle cx={hx} cy={hy} r="5.5" fill="var(--danger)" />
      </svg>
      <span className="chrono-time">{label}</span>
    </div>
  );
}
