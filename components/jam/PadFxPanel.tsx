"use client";
import { useRef } from "react";
import { PAD_FX, harmonyInterval, transSemis, type PadFxId } from "@/lib/audio/padFx";
import { PadEqSection } from "./PadEqSection";

interface Props {
  stems: { stem: string; label: string; color: string }[];
  current: string;
  onCurrent: (stem: string) => void;
  fx: { on: Record<PadFxId, boolean>; amount: Record<PadFxId, number> } | null;
  mods: { reverse: boolean; half: boolean } | null;
  onFx: (id: PadFxId, on: boolean) => void;
  onAmount: (id: PadFxId, a: number) => void;
  onMod: (m: "reverse" | "half", on: boolean) => void;
  onReset: () => void;
  eq?: { gains: number[]; onGain: (i: number, db: number) => void; onAuto: () => Promise<number[] | null>; onEqReset: () => void };
}

export function PadFxPanel(props: Props) {
  const color = props.stems.find(s => s.stem === props.current)?.color ?? "#38bdf8";
  const { fx, mods } = props;
  const gestureState = useRef<Record<string, { x: number; moved: boolean }>>({});

  return (
    <aside className="flex w-full min-w-0 flex-col gap-1.5 rounded-lg p-1.5 ring-1 ring-white/10 max-h-[28rem] overflow-y-auto" aria-label="Effets des pads">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-200">Effets</span>
        <button className="rounded px-1.5 py-0.5 text-[9px] font-bold"
          style={{ background: "#404040", color: "#e5e5e5" }} title="Coupe tous les effets de cette rangée" onClick={props.onReset}>AUCUN</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {props.stems.map(({ stem, label, color }) => (
          <button
            key={stem}
            className="rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={props.current === stem ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            aria-pressed={props.current === stem}
            onClick={() => props.onCurrent(stem)}
          >
            {label}
          </button>
        ))}
      </div>
      {fx === null || mods === null ? (
        <p className="text-[10px] text-neutral-400">Choisis une rangée.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1">
            {PAD_FX.map(f => {
              const on = fx.on[f.id];
              const v = fx.amount[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={on}
                  title={f.title}
                  className="relative h-6 w-full overflow-hidden rounded px-1.5 text-left text-[10px] font-bold leading-6 select-none touch-none"
                  style={on ? { background: "rgba(255,255,255,0.10)", color: "#f5f5f5", boxShadow: `inset 0 0 0 1px ${color}` } : { background: "rgba(255,255,255,0.05)", color: "#a3a3a3" }}
                  onClick={() => {
                    if (!gestureState.current[f.id]?.moved) {
                      props.onFx(f.id, !on);
                    }
                  }}
                  onPointerDown={e => {
                    gestureState.current[f.id] = { x: e.clientX, moved: false };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={e => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      const dx = e.clientX - gestureState.current[f.id].x;
                      if (Math.abs(dx) > 3) {
                        gestureState.current[f.id].moved = true;
                      }
                      if (gestureState.current[f.id].moved) {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const a = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
                        props.onAmount(f.id, a);
                        if (!on) props.onFx(f.id, true);
                      }
                    }
                  }}
                  onPointerUp={e => {
                    e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                >
                  {on && <div className="absolute inset-y-0 left-0 pointer-events-none" style={{ width: `${Math.round(v * 100)}%`, background: color, opacity: 0.35 }} />}
                  <span className="relative pointer-events-none">
                    {f.label}
                    {on && f.id === "harmony" && <span className="ml-1 text-[8px] text-neutral-400">{harmonyInterval(v)}</span>}
                    {on && f.id === "trans" && <span className="ml-1 text-[8px] text-neutral-400">{`${transSemis(v) > 0 ? "+" : ""}${transSemis(v)}`}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {props.eq && <PadEqSection gains={props.eq.gains} color={color} onGain={props.eq.onGain} onAuto={props.eq.onAuto} onReset={props.eq.onEqReset} />}
          <div className="flex gap-1">
            <button
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={mods.reverse ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
              aria-pressed={mods.reverse}
              title="La boucle jouée à l'envers"
              onClick={() => props.onMod("reverse", !mods.reverse)}
            >
              Inverse
            </button>
            <button
              className="rounded px-1.5 py-0.5 text-[10px] font-bold"
              style={mods.half ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
              aria-pressed={mods.half}
              title="Deux fois plus lent, une octave plus grave"
              onClick={() => props.onMod("half", !mods.half)}
            >
              Demi-vitesse
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
