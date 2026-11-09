"use client";
import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { FULL, REPEATS, isFull, snapTrim, type Repeats, type Trim } from "@/lib/audio/padTrim";

// The thin slider under a pad: the left handle makes the pad start later, the right one makes it end sooner.
// Drag anywhere on it (the nearest handle follows), arrows on a handle move it one step, double-click resets.
export function PadTrim({ value, steps, color, label, onChange }: { value: Trim; steps: number; color: string; label: string; onChange: (t: Trim) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<0 | 1 | null>(null);
  const full = isFull(value);

  const frac = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / Math.max(1, r.width)));
  };
  const move = (h: 0 | 1, x: number) => {
    const t: Trim = h === 0 ? [x, value[1]] : [value[0], x];
    const s = snapTrim(t, steps, h);
    if (s[0] !== value[0] || s[1] !== value[1]) onChange(s);
  };
  const key = (h: 0 | 1) => (e: KeyboardEvent) => {
    const d = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    move(h, value[h] + d / steps);
  };
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const handle = (h: 0 | 1) => (
    <span
      role="slider"
      tabIndex={0}
      aria-label={h === 0 ? `Début du pad ${label}` : `Fin du pad ${label}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value[h] * 100)}
      aria-valuetext={`${Math.round(value[h] * 100)} %`}
      onKeyDown={key(h)}
      className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0a0a0a] shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
      style={{ left: pct(value[h]), background: full ? "#a3a3a3" : color, transform: `translate(-50%, -50%) scale(${drag === h ? 1.25 : 1})`, transition: "transform 80ms" }}
    />
  );

  return (
    <div
      ref={track}
      className="relative mx-2 mt-1.5 h-4 cursor-ew-resize touch-none select-none"
      title="Découpe : glisse la poignée de gauche pour démarrer plus tard, celle de droite pour finir plus tôt (double-clic : tout le sample)"
      onPointerDown={(e) => {
        const x = frac(e);
        const h: 0 | 1 = Math.abs(x - value[0]) <= Math.abs(x - value[1]) ? 0 : 1; // the nearest handle
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(h);
        move(h, x);
      }}
      onPointerMove={(e) => drag !== null && move(drag, frac(e))}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={() => onChange(FULL)}
    >
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/10" />
      <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ left: pct(value[0]), width: pct(value[1] - value[0]), background: full ? "rgba(255,255,255,0.28)" : color }} />
      {handle(0)}
      {handle(1)}
    </div>
  );
}

// how many times a stem's loops play before stopping by themselves: 1, 2, 4, 8 or endless
export function RepeatsPicker({ value, color, onChange, compact = false }: { value: number; color: string; onChange: (v: Repeats) => void; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Répétitions de la boucle" title="Combien de fois une boucle se répète avant de s'arrêter seule (∞ : jusqu'à ce qu'on l'arrête)">
      <span className={`${compact ? "text-[9px]" : "text-[10px]"} font-bold uppercase tracking-wider text-[var(--jam-text-2,#a3a3a3)]`}>Répét.</span>
      {REPEATS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={n ? `${n} fois` : "à l'infini"}
          onClick={() => onChange(n)}
          className={`rounded ${compact ? "min-w-6 px-1.5 py-0.5 text-[10px]" : "min-w-7 px-2 py-1 text-[11px]"} font-bold`}
          style={value === n ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
        >
          {n ? `${n}×` : "∞"}
        </button>
      ))}
    </div>
  );
}
