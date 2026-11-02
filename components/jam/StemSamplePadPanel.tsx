"use client";
import { useEffect, useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { PAD_COLS, stemSamplePad } from "@/lib/audio/stemSamplePad";
import { Knob } from "../Knob";
import { PAD_KEYS, PAD_ROW_COLORS, SamplePadButton, usePadKeys } from "./SamplePadButton";
import { PadFxPanel } from "./PadFxPanel";
import { smartEqGains } from "@/lib/padEq";

const C = "var(--jam-pad)";
const STEM_FR: Record<string, string> = { drums: "Batterie", bass: "Basse", other: "Autre", vocals: "Voix", guitar: "Guitare", piano: "Piano" };

export function StemSamplePadPanel({ engine }: { engine: DJEngine }) {
  const m = stemSamplePad(engine);
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const rows = m.rows();
  const [keys, setKeys] = useState(false);
  const [fxRow, setFxRow] = useState(""); // the row whose effects are shown next to the pads // the computer keyboard plays the pads (rows 1-5, A-T, Q-G, W-B)
  usePadKeys(keys, rows.length, (r, col, down) => { const row = rows[r]; if (row?.pads[col]) { m.press(row.stem, col, down); bump(); } });
  const total = Object.values(m.samples ?? {}).reduce((acc, pool) => acc + pool.length, 0); // the whole pool, not only the pads shown

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
    <section className="hw-panel @container flex flex-col gap-3 p-3" aria-label="Stem Sample Pad">
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
           `${rows.length} stems · ${total} samples${m.deep ? " · analyse approfondie" : " · Préparation > Stems Pad pour une analyse approfondie"}`}
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
          type="button"
          className="rounded px-2 py-1 text-[11px] font-bold"
          style={{ background: C, color: "#0a0a0a" }}
          onClick={() => { m.refresh(); bump(); }}
          title="Met d'autres boucles et coups trouvés dans le morceau sur tous les pads, en live (ce qui joue continue)"
        >
          RAFRAÎCHIR
        </button>
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
      
      <div className="flex flex-col gap-3 @[560px]:flex-row @[560px]:items-start">
      <div className="flex flex-col gap-1.5">
        {rows.map((row, r) => (
          <div
            key={row.stem}
            className="grid items-stretch gap-1.5"
            style={{ gridTemplateColumns: `5.5rem repeat(${PAD_COLS}, minmax(48px, 1fr))` }}
          >
            <div className="flex flex-col items-start gap-1 self-center">
              <span className="text-[11px] font-bold uppercase text-neutral-300">{STEM_FR[row.stem] ?? row.stem}</span>
              {m.pagesOf(row.stem) > 1 && (
                <button
                  type="button"
                  onClick={() => { m.refresh(row.stem); bump(); }}
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
                  title="Met d'autres boucles et coups de ce stem sur ses pads (ce qui joue continue)"
                >
                  ↻ {m.pageOf(row.stem)}/{m.pagesOf(row.stem)}
                </button>
              )}
            </div>
            {Array.from({ length: PAD_COLS }).map((_, col) => {
              const pad = row.pads[col];
              const on = m.isOn(row.stem, col);
              if (!pad) {
                return <div key={col} className="aspect-square w-full min-w-[48px] rounded-[10px] border border-dashed border-white/10" />;
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
      {rows.length > 0 && (() => {
        const cur = rows.some((r) => r.stem === fxRow) ? fxRow : rows[0].stem;
        const f = m.fxOf(cur);
        return (
          <div className="w-full @[560px]:w-[220px] @[560px]:shrink-0">
          <PadFxPanel
            stems={rows.map((r, i) => ({ stem: r.stem, label: STEM_FR[r.stem] ?? r.stem, color: PAD_ROW_COLORS[i % PAD_ROW_COLORS.length] }))}
            current={cur}
            onCurrent={(st) => setFxRow(st)}
            fx={{ on: { ...f.on }, amount: { ...f.amount } }}
            mods={{ ...m.modsOf(cur) }}
            onFx={(id, on) => { m.setFx(cur, id, on); bump(); }}
            onAmount={(id, a) => { m.setFxAmount(cur, id, a); bump(); }}
            onMod={(k, on) => { m.setMod(cur, k, on); bump(); }}
            onReset={() => { m.resetFx(cur); bump(); }}
            eq={{
              gains: m.fxOf(cur).eqGains(),
              onGain: (i, db) => { m.fxOf(cur).setEq(i, db); bump(); },
              onAuto: async () => {
                const bands = await m.fxOf(cur).measureBands(1500);
                if (!bands.some((b) => Number.isFinite(b) && b > -90)) return null; // nothing plays on this row yet
                const g = smartEqGains(cur, bands);
                g.forEach((db, i) => m.fxOf(cur).setEq(i, db));
                bump();
                return g;
              },
              onEqReset: () => { m.fxOf(cur).resetEq(); bump(); },
            }}
          />
          </div>
        );
      })()}
      </div>
    </section>
  );
}

