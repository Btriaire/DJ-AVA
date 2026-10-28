"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { RouteKind, RhythmRoute, RhythmSource } from "@/lib/audio/rhythmBus";

// one colour per source (OKLCH, no pink): the scribble strip, the knob ring and the fader cap
const SOURCE_STYLE: Record<RhythmSource, { glow: string }> = {
  drums: { glow: "oklch(72% 0.17 45)" },
  bass: { glow: "oklch(70% 0.15 285)" },
  synth: { glow: "oklch(76% 0.12 205)" },
  voice: { glow: "oklch(84% 0.16 95)" },
  beat: { glow: "oklch(76% 0.17 150)" },
  bar: { glow: "oklch(76% 0.17 150)" },
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

// vertical VU meter: 12 segments, green then amber then red, lit from the bottom on every event
export function Meter({ read, on }: { read: () => number | undefined; on: boolean }) {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = read();
      setLit(on && t !== undefined ? Math.max(0, 1 - (performance.now() - t) / 600) : 0);
    }, 60);
    return () => window.clearInterval(id);
  }, [read, on]);
  return (
    <div className="flex h-[132px] w-3 flex-col-reverse gap-[2px] rounded-sm bg-black/60 p-[2px]" aria-hidden="true">
      {Array.from({ length: 12 }, (_, i) => {
        const c = i >= 10 ? "oklch(65% 0.24 25)" : i >= 8 ? "oklch(80% 0.17 80)" : "oklch(75% 0.2 145)";
        const onSeg = lit > i / 12;
        return <span key={i} className="flex-1 rounded-[1px]" style={{ background: onSeg ? c : "oklch(25% 0.01 240)", boxShadow: onSeg ? `0 0 5px ${c}` : "none" }} />;
      })}
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
  const color = SOURCE_STYLE[r.source].glow;
  const screw = <span className="h-1.5 w-1.5 rounded-full bg-neutral-600 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.6)]" />;

  return (
    <article
      className={`relative flex w-[176px] shrink-0 flex-col gap-2 rounded-lg border border-neutral-700 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${!r.on ? "opacity-70" : ""}`}
      style={{ background: "linear-gradient(180deg, oklch(30% 0.012 240), oklch(22% 0.01 240))" }}
    >
      <div className="flex justify-between px-0.5">{screw}{screw}</div>

      {/* scribble strip: the source, then the device it drives */}
      <div className="rounded-md px-2 py-1 text-center text-[11px] font-black uppercase tracking-wider text-black" style={{ background: color }}>
        {sourceLabel}
      </div>
      <div className="flex items-center gap-1.5 rounded-md bg-black/50 px-2 py-1.5">
        <DeviceIcon kind={r.kind} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[10px] text-neutral-400">{DEVICE[r.kind].name}</span>
          <span className="truncate text-xs text-neutral-100">{targetLabel}</span>
        </div>
      </div>

      {/* VU meter and the Force fader side by side */}
      <div className="flex items-stretch justify-center gap-4 py-1">
        <Meter read={readFire} on={r.on} />
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-neutral-400">Force {Math.round(r.amount * 100)}</span>
          <input
            type="range" min={0.1} max={1} step={0.05} value={r.amount} aria-label="Force"
            onChange={(e) => onAmount(parseFloat(e.target.value))}
            className="h-[116px] w-6 cursor-ns-resize [writing-mode:vertical-lr] [direction:rtl]"
            style={{ accentColor: color }}
          />
        </div>
      </div>

      {/* ON / MUTE with its LED, and delete */}
      <div className="flex items-center gap-2">
        <button
          type="button" role="switch" aria-checked={r.on}
          aria-label={r.on ? "Couper la liaison" : "Activer la liaison"}
          onClick={onToggle}
          className="flex min-h-9 flex-1 items-center justify-center gap-2 rounded-md border border-neutral-600 bg-neutral-800 text-[11px] font-bold tracking-wider text-neutral-200 hover:bg-neutral-700"
        >
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.on ? "oklch(78% 0.22 145)" : "oklch(55% 0.2 25)", boxShadow: r.on ? "0 0 8px oklch(78% 0.22 145)" : "none" }} />
          {r.on ? "ON" : "MUTE"}
        </button>
        <button type="button" onClick={onRemove} aria-label="Supprimer la liaison" className="flex min-h-9 w-9 items-center justify-center rounded-md border border-neutral-700 text-neutral-400 hover:text-neutral-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18L18 6M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
      </div>

      {children && (
        <details>
          <summary className="min-h-8 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-neutral-400">Réglages</summary>
          <div className="mt-1">{children}</div>
        </details>
      )}
      <div className="flex justify-between px-0.5">{screw}{screw}</div>
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
        className="min-h-10 bg-sky-500 text-black font-bold rounded-lg flex items-center justify-center gap-2"
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
