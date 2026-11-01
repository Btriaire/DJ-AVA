"use client";
import { Knob } from "../Knob";
import { PAD_FX, harmonyInterval, transSemis, type PadFxId } from "@/lib/audio/padFx";

export function PadFxPanel(props: { stems: { stem: string; label: string; color: string }[]; current: string; onCurrent: (stem: string) => void; fx: { on: Record<PadFxId, boolean>; amount: Record<PadFxId, number> } | null; mods: { reverse: boolean; half: boolean } | null; onFx: (id: PadFxId, on: boolean) => void; onAmount: (id: PadFxId, a: number) => void; onMod: (m: "reverse" | "half", on: boolean) => void; onReset: () => void }) {
  const { fx, mods } = props;
  const color = props.stems.find((s) => s.stem === props.current)?.color ?? "#38bdf8";
  return (
    <aside className="flex w-full flex-col gap-2 rounded-lg p-2 ring-1 ring-white/10 @[900px]:w-[300px] @[900px]:shrink-0" aria-label="Effets des pads">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Effets</span>
        <button onClick={props.onReset} title="Coupe tous les effets de cette rangée" className="rounded px-2 py-1 text-[10px] font-bold bg-neutral-700 text-neutral-200">AUCUN</button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase text-neutral-400">Rangée</span>
        {props.stems.map((s) => (
          <button
            key={s.stem}
            onClick={() => props.onCurrent(s.stem)}
            aria-pressed={s.stem === props.current}
            className="rounded px-2 py-1 text-[10px] font-bold"
            style={s.stem === props.current ? { background: s.color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          >
            {s.label}
          </button>
        ))}
      </div>
      {fx === null || mods === null ? (
        <p className="text-[11px] text-neutral-400">Choisis une rangée.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {PAD_FX.map((f) => (
              <div key={f.id} className="flex flex-col items-center gap-1 rounded p-1.5" style={{ background: fx.on[f.id] ? "rgba(255,255,255,0.08)" : "transparent" }}>
                <button
                  onClick={() => props.onFx(f.id, !fx.on[f.id])}
                  aria-pressed={fx.on[f.id]}
                  title={f.title}
                  className="w-full rounded px-2 py-1 text-[10px] font-bold"
                  style={fx.on[f.id] ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
                >
                  {f.label}
                </button>
                <Knob
                  size={32}
                  min={0}
                  max={1}
                  defaultValue={f.def}
                  led
                  color={color}
                  label=""
                  value={fx.amount[f.id]}
                  format={(v: number) => {
                    if (f.id === "harmony") {
                      return ({ 3: "tierce", 5: "quarte", 7: "quinte" } as Record<number, string>)[harmonyInterval(v)];
                    } else if (f.id === "trans") {
                      return `${transSemis(v) > 0 ? "+" : ""}${transSemis(v)} dt`;
                    } else {
                      return `${Math.round(v * 100)} %`;
                    }
                  }}
                  onChange={(v: number) => props.onAmount(f.id, v)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase text-neutral-400">Lecture</span>
            <button
              onClick={() => props.onMod("reverse", !mods.reverse)}
              aria-pressed={mods.reverse}
              title="La boucle jouée à l'envers"
              className="rounded px-2 py-1 text-[10px] font-bold"
              style={mods.reverse ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            >
              Inverse
            </button>
            <button
              onClick={() => props.onMod("half", !mods.half)}
              aria-pressed={mods.half}
              title="Deux fois plus lent, une octave plus grave"
              className="rounded px-2 py-1 text-[10px] font-bold"
              style={mods.half ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            >
              Demi-vitesse
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
