"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { RouteKind, RhythmRoute, RhythmSource } from "@/lib/audio/rhythmBus";

// full class names, so Tailwind can see them: border of the card and tint of the source chip
const SOURCE_STYLE: Record<RhythmSource, { border: string; chip: string }> = {
  drums: { border: "border-l-orange-400", chip: "bg-orange-400/15 text-orange-200" },
  bass: { border: "border-l-purple-400", chip: "bg-purple-400/15 text-purple-200" },
  synth: { border: "border-l-cyan-400", chip: "bg-cyan-400/15 text-cyan-200" },
  voice: { border: "border-l-fuchsia-400", chip: "bg-fuchsia-400/15 text-fuchsia-200" },
  beat: { border: "border-l-emerald-400", chip: "bg-emerald-400/15 text-emerald-200" },
  bar: { border: "border-l-emerald-400", chip: "bg-emerald-400/15 text-emerald-200" },
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

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-300">Force</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          aria-label="Force"
          value={r.amount}
          onChange={(e) => onAmount(parseFloat(e.target.value))}
          className="flex-1 accent-orange-400"
        />
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
