"use client";
import { useEffect, useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { PAD_COLS, stemSamplePad } from "@/lib/audio/stemSamplePad";
import { Knob } from "../Knob";
import { PAD_KEYS, PAD_ROW_COLORS, SamplePadButton, usePadKeys } from "./SamplePadButton";

const C = "var(--jam-pad)";
const STEM_FR: Record<string, string> = { drums: "Batterie", bass: "Basse", other: "Autre", vocals: "Voix", guitar: "Guitare", piano: "Piano" };

export function StemSamplePadPanel({ engine }: { engine: DJEngine }) {
  const m = stemSamplePad(engine);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const rows = m.rows();
  const [keys, setKeys] = useState(false); // the computer keyboard plays the pads (rows 1-5, A-T, Q-G, W-B)
  usePadKeys(keys, rows.length, (r, col, down) => { const row = rows[r]; if (row?.pads[col]) { m.press(row.stem, col, down); bump(); } });
  const total = rows.reduce((acc, row) => acc + row.pads.length, 0);

  useEffect(() => {
    const interval = setInterval(bump, 250);
    return () => clearInterval(interval);
  }, []);

  const set = (fn: () => void) => {
    fn();
    bump();
  };

  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <section className="hw-panel flex flex-col gap-3 p-3" aria-label="Stem Sample Pad">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-black uppercase tracking-[0.2em]" style={{ color: C }}>Stem Sample Pad</h3>
        <button
          className="rounded px-2 py-1 text-[11px] font-bold"
          style={m.side === "A" ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          aria-pressed={m.side === "A"}
          onClick={() => set(() => m.side = "A")}
        >
          A
        </button>
        <button
          className="rounded px-2 py-1 text-[11px] font-bold"
          style={m.side === "B" ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          aria-pressed={m.side === "B"}
          onClick={() => set(() => m.side = "B")}
        >
          B
        </button>
        <span className="ml-auto text-[11px] text-neutral-300">
          {m.status === "idle" ? "Charge un morceau préparé (stems) sur la platine" :
           m.status === "loading" ? "Recherche des samples…" :
           m.status === "error" ? "Pas de samples : prépare les stems du morceau" :
           `${rows.length} stems · ${total} samples`}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-neutral-300">
        Les samples sont trouvés à la préparation dans chaque stem : des boucles sur les mesures qui se répètent vraiment, et des coups coupés dans les petits blancs. Une rangée par stem, cinq pads. Les boucles partent calées sur la grille ; les coups partent au double croche.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold">Calage</span>
          <button
            className="rounded px-2 py-1 text-[11px] font-bold"
            style={m.quant === 0 ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            aria-pressed={m.quant === 0}
            onClick={() => set(() => m.quant = 0)}
          >
            Immédiat
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] font-bold"
            style={m.quant === 1 ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            aria-pressed={m.quant === 1}
            onClick={() => set(() => m.quant = 1)}
          >
            Temps
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] font-bold"
            style={m.quant === 4 ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            aria-pressed={m.quant === 4}
            onClick={() => set(() => m.quant = 4)}
          >
            Mesure
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold">Boucles</span>
          <button
            className="rounded px-2 py-1 text-[11px] font-bold"
            style={!m.hold ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            aria-pressed={!m.hold}
            onClick={() => set(() => m.hold = false)}
          >
            Bascule
          </button>
          <button
            className="rounded px-2 py-1 text-[11px] font-bold"
            style={m.hold ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
            aria-pressed={m.hold}
            onClick={() => set(() => (m.hold = true))}
          >
            Tenir
          </button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold uppercase text-neutral-300" htmlFor="level">
            NIVEAU
          </label>
          <Knob
            label="Niveau"
            value={m.level}
            min={0}
            max={1.2}
            defaultValue={0.9}
            color={C}
            size={40}
            led
            format={(v: number) => `${Math.round(v * 100)} %`}
            onChange={(v: number) => { m.setLevel(v); bump(); }}
          />
        </div>
        <button
          className="rounded px-2 py-1 text-[11px] font-bold bg-[rgba(255,255,255,0.08)] text-[#d4d4d4]"
          onClick={() => m.stopAll()}
        >
          TOUT ARRÊTER
        </button>
        <button
          type="button"
          aria-pressed={keys}
          onClick={() => setKeys((k) => !k)}
          className="rounded px-2 py-1 text-[11px] font-bold"
          style={keys ? { background: C, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
          title="Joue les pads au clavier de l'ordinateur : rangées 1 à 5, A à T, Q à G, W à B"
        >
          CLAVIER
        </button>
      </div>
      
      <div className="flex flex-col gap-1.5">
        {rows.map((row, r) => (
          <div
            key={row.stem}
            className="grid items-stretch gap-1.5"
            style={{ gridTemplateColumns: `5.5rem repeat(${PAD_COLS}, minmax(64px, 120px))` }}
          >
            <div className="text-[11px] font-bold uppercase text-neutral-300 self-center">
              {STEM_FR[row.stem]}
            </div>
            {Array.from({ length: PAD_COLS }).map((_, col) => {
              const pad = row.pads[col];
              const on = m.isOn(row.stem, col);
              if (!pad) {
                return <div key={col} className="aspect-square w-full min-w-[64px] max-w-[120px] rounded-[10px] border border-dashed border-white/10" />;
              }
              return (
                <SamplePadButton
                  key={col}
                  label={pad.label}
                  info={pad.kind === "loop" ? `${pad.bars} mes. · ${fmt(pad.start)}` : `${(pad.end - pad.start).toFixed(1)} s · ${fmt(pad.start)}`}
                  kind={pad.kind}
                  color={PAD_ROW_COLORS[r % PAD_ROW_COLORS.length]}
                  on={on}
                  keyLabel={keys ? PAD_KEYS[r]?.[col]?.label : undefined}
                  onPress={(down) => { m.press(row.stem, col, down); bump(); }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

