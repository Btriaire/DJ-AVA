"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { RouteKind, RhythmRoute, RhythmSource } from "@/lib/audio/rhythmBus";

// full class names, so Tailwind can see them: border of the card and tint of the source chip
const SOURCE_STYLE: Record<RhythmSource, { glow: string; border: string; chip: string }> = {
  drums: { glow: "#fb923c", border: "border-l-orange-400", chip: "bg-orange-400/15 text-orange-200" },
  bass: { glow: "#c084fc", border: "border-l-purple-400", chip: "bg-purple-400/15 text-purple-200" },
  synth: { glow: "#22d3ee", border: "border-l-cyan-400", chip: "bg-cyan-400/15 text-cyan-200" },
  voice: { glow: "#e879f9", border: "border-l-fuchsia-400", chip: "bg-fuchsia-400/15 text-fuchsia-200" },
  beat: { glow: "#34d399", border: "border-l-emerald-400", chip: "bg-emerald-400/15 text-emerald-200" },
  bar: { glow: "#34d399", border: "border-l-emerald-400", chip: "bg-emerald-400/15 text-emerald-200" },
};

export function ActivityDot({ read, on }: { read: () => number | undefined; on: boolean }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!on) return;
    const interval = setInterval(() => {
      const last = read();
      setActive(last !== undefined && performance.now() - last < 160);
    }, 120);
    return () => clearInterval(interval);
  }, [on, read]);

  return (
    <div
      aria-hidden
      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
        !on ? "bg-neutral-800" : active ? "bg-emerald-400 shadow-[0_0_6px_1px_rgba(52,211,153,0.6)]" : "bg-neutral-600"
      }`}
    />
  );
}

// rotary knob: drag up/down, mouse wheel or arrow keys; 270 degrees of travel
export function Knob({ label, value, min, max, step, onChange, color }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; color: string }) {
  const frac = (value - min) / (max - min);
  const a = (-135 + frac * 270) * (Math.PI / 180);
  const set = (v: number) => onChange(Math.round(Math.min(max, Math.max(min, v)) / step) * step);
  const arc = (f: number) => {
    const t = (-135 + f * 270 - 90) * (Math.PI / 180);
    return `${22 + 17 * Math.cos(t)} ${22 + 17 * Math.sin(t)}`;
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg
        width="44" height="44" viewBox="0 0 44 44" role="slider" tabIndex={0} aria-label={label}
        aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} className="cursor-ns-resize touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-full"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const y0 = e.clientY, v0 = value;
          const move = (m: PointerEvent) => set(v0 + ((y0 - m.clientY) / 120) * (max - min));
          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
        onWheel={(e) => set(value - Math.sign(e.deltaY) * step)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); set(value + step); }
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); set(value - step); }
        }}
      >
        <circle cx="22" cy="22" r="15" fill="#171717" stroke="#404040" />
        <path d={`M ${arc(0)} A 17 17 0 ${frac > 0.67 ? 1 : 0} 1 ${arc(Math.max(frac, 0.001))}`} stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
        <line x1="22" y1="22" x2={22 + 11 * Math.sin(a)} y2={22 - 11 * Math.cos(a)} stroke="#e5e5e5" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="text-[10px] uppercase tracking-wider text-neutral-400">{label} {Math.round(frac * 100)}</span>
    </div>
  );
}

// row of LEDs that lights up and fades on every event the link plays
export function Meter({ read, on, color }: { read: () => number | undefined; on: boolean; color: string }) {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = read();
      setLit(on && t !== undefined ? Math.max(0, 1 - (performance.now() - t) / 700) : 0);
    }, 70);
    return () => window.clearInterval(id);
  }, [read, on]);
  return (
    <div className="flex flex-1 items-center gap-1" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className="h-3 flex-1 rounded-sm" style={{ background: lit > i / 10 ? color : "#262626", boxShadow: lit > i / 10 ? `0 0 6px ${color}` : "none" }} />
      ))}
    </div>
  );
}

// the device a link drives: a name and a small drawing (keys, pads, knob, steps, speaker)
const DEVICE: Record<RouteKind, { name: string; icon: "keys" | "pads" | "knob" | "steps" | "speaker" }> = {
  voices: { name: "Nappes (chœur, cordes…)", icon: "keys" },
  synth: { name: "Synthé DJ", icon: "keys" }, synth2: { name: "Synthé (module Global)", icon: "keys" }, plugin: { name: "DX7", icon: "keys" },
  sampler: { name: "Super-Sampler", icon: "pads" }, pad: { name: "Sampler", icon: "pads" }, drum: { name: "Boîte à rythmes", icon: "pads" },
  keypad: { name: "DJ Keys", icon: "pads" }, keyfx: { name: "DJ Keys", icon: "pads" },
  seqrec: { name: "Séquenceur", icon: "steps" }, rack: { name: "Rack", icon: "knob" }, djknob: { name: "Synthé DJ", icon: "knob" },
  filter: { name: "Filtre du deck", icon: "knob" }, duck: { name: "Volume du deck", icon: "knob" }, sfx: { name: "Effets sonores", icon: "speaker" },
};
function DeviceIcon({ kind }: { kind: RouteKind }) {
  const c = { stroke: "currentColor", strokeWidth: 1.3, fill: "none" } as const;
  const i = DEVICE[kind].icon;
  return (
    <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" className="shrink-0 text-neutral-300">
      <rect x="1" y="1" width="26" height="18" rx="3" {...c} />
      {i === "keys" && <><path d="M7 1v18M13 1v18M19 1v18" {...c} /><path d="M5 1h4v10H5zM11 1h4v10h-4zM17 1h4v10h-4z" fill="currentColor" /></>}
      {i === "pads" && <><rect x="4" y="4" width="6" height="5" {...c} /><rect x="11" y="4" width="6" height="5" {...c} /><rect x="18" y="4" width="6" height="5" {...c} /><rect x="4" y="11" width="6" height="5" {...c} /><rect x="11" y="11" width="6" height="5" {...c} /><rect x="18" y="11" width="6" height="5" {...c} /></>}
      {i === "knob" && <><circle cx="14" cy="10" r="6" {...c} /><path d="M14 10l3-4" {...c} /></>}
      {i === "steps" && <><path d="M4 14h4v-4h4v4h4v-6h4v6h4" {...c} /></>}
      {i === "speaker" && <><circle cx="14" cy="10" r="5" {...c} /><circle cx="14" cy="10" r="1.5" fill="currentColor" /></>}
    </svg>
  );
}

export function RouteCard(props: {
  r: RhythmRoute;
  sourceLabel: string;
  targetLabel: string;
  readFire: () => number | undefined;
  onToggle: () => void;
  onAmount: (v: number) => void;
  onRemove: () => void;
  children?: ReactNode;
}) {
  const { r, sourceLabel, targetLabel, readFire, onToggle, onAmount, onRemove, children } = props;
  const style = SOURCE_STYLE[r.source];

  return (
    <article
      className={`flex flex-col gap-2 rounded-xl border-l-4 bg-neutral-900 p-3 ${style.border} ${
        !r.on ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <ActivityDot read={readFire} on={r.on} />

        <div className="flex items-center gap-1 flex-1">
          <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}>
            {sourceLabel}
          </div>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 8H12M12 8L8 4M12 8L8 12" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="flex items-center gap-1.5 rounded-lg bg-neutral-800 px-2 py-1">
            <DeviceIcon kind={r.kind} />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[10px] text-neutral-400">{DEVICE[r.kind].name}</span>
              <span className="truncate text-xs">{targetLabel}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-label={r.on ? "Couper la liaison" : "Activer la liaison"}
          aria-checked={r.on}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            r.on ? "bg-emerald-500" : "bg-neutral-700"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              r.on ? "translate-x-5" : ""
            }`}
          />
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Supprimer la liaison"
          className="min-h-9 min-w-9 flex items-center justify-center"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 18L18 6M6 6L18 18" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <Knob label="Force" value={r.amount} min={0.1} max={1} step={0.05} onChange={onAmount} color={style.glow} />
        <Meter read={readFire} on={r.on} color={style.glow} />
      </div>

      {children && (
        <details className="mt-1">
          <summary className="min-h-9 text-xs font-bold text-neutral-300 cursor-pointer">
            Réglages
          </summary>
          <div className="mt-1">{children}</div>
        </details>
      )}
    </article>
  );
}

export function PresetPicker(props: {
  groups: { title: string; items: { label: string; hint?: string }[] }[];
  onPick: (group: number, item: number, side: "A" | "B") => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"A" | "B">("A");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="min-h-10 bg-fuchsia-500 text-white rounded-lg flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Nouvelle liaison
      </button>

      {open && (
        <div className={`bg-neutral-900 rounded-lg p-3 ${props.compact ? "max-w-xs" : ""}`}>
          <div className="flex gap-1 mb-3">
            <button
              type="button"
              onClick={() => setSide("A")}
              aria-pressed={side === "A"}
              className={`flex-1 min-h-9 rounded-lg ${
                side === "A" ? "bg-orange-400 font-bold text-neutral-950" : "bg-neutral-800"
              }`}
            >
              Deck A
            </button>
            <button
              type="button"
              onClick={() => setSide("B")}
              aria-pressed={side === "B"}
              className={`flex-1 min-h-9 rounded-lg ${
                side === "B" ? "bg-orange-400 font-bold text-neutral-950" : "bg-neutral-800"
              }`}
            >
              Deck B
            </button>
          </div>

          {props.groups.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-4">
              <h3 className="text-[11px] uppercase tracking-widest text-neutral-400 mb-2">
                {group.title}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {group.items.map((item, itemIndex) => (
                  <button
                    type="button"
                    key={itemIndex}
                    onClick={() => props.onPick(groupIndex, itemIndex, side)}
                    className="min-h-10 bg-neutral-800 rounded-lg p-2 text-left"
                  >
                    <div className="text-sm">{item.label}</div>
                    {item.hint && (
                      <div className="text-[11px] text-neutral-400">{item.hint}</div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full min-h-9 bg-neutral-800 rounded-lg mt-2"
          >
            Fermer
          </button>
        </div>
      )}
    </div>
  );
}
