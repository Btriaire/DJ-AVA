"use client";
import { Knob } from "../Knob";
import { JamSeg } from "./JamKit";
import { INSTRUMENTS } from "@/lib/sampleFont";
import type { HarmoSynth } from "@/lib/audio/jamModules";

const pct = (v: number) => `${Math.round(v * 100)} %`;

export function SynthSound({ m, C, bump }: { m: HarmoSynth; C: string; bump: () => void }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Paramètres sonores du synthé">
      <h4 className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--jam-text-2)]">Son</h4>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Son du synthé"
          className="rounded-md px-2 py-1.5 text-[12px] font-bold"
          style={{
            background: "oklch(0.21 0.01 280)",
            color: "var(--jam-text)",
            border: "1px solid var(--jam-line)"
          }}
          value={m.voice}
          onChange={(e) => { m.setVoice(e.target.value); bump(); }}
        >
          <optgroup label="Synthés">
            <option value="synth:pluck">Pluck</option>
            <option value="synth:supersaw">Supersaw</option>
            <option value="synth:organ">Orgue (synthé)</option>
            <option value="synth:keys">Keys FM</option>
            <option value="synth:brass">Cuivres (synthé)</option>
          </optgroup>
          {["Claviers", "Percussions mélodiques", "Cordes", "Voix", "Vents", "Guitares", "Nappes"].map(family => (
            <optgroup key={family} label={family}>
              {INSTRUMENTS.filter(i => i.family === family).map(i => (
                <option key={i.id} value={`inst:${i.id}`}>{i.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {["acoustic_grand_piano", "electric_piano_1", "string_ensemble_1", "choir_aahs", "brass_section", "acoustic_guitar_nylon"].map(id => (
          <button
            key={id}
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-bold"
            aria-pressed={m.voice === `inst:${id}`}
            style={m.voice === `inst:${id}`
              ? {
                  background: `color-mix(in srgb, ${C} 35%, #111)`,
                  color: "#fff",
                  boxShadow: `inset 0 0 0 1px ${C}`
                }
              : {
                  background: "rgba(255,255,255,.06)",
                  color: "var(--jam-text-2)"
                }
            }
            onClick={() => { m.setVoice(`inst:${id}`); bump(); }}
          >
            {id === "acoustic_grand_piano" ? "Piano" :
             id === "electric_piano_1" ? "Rhodes" :
             id === "string_ensemble_1" ? "Cordes" :
             id === "choir_aahs" ? "Chœur" :
             id === "brass_section" ? "Cuivres" :
             "Guitare"}
          </button>
        ))}
      </div>
      {m.voiceStatus() && (
        <div className="text-[11px] text-[var(--jam-text-2)]" aria-live="polite">
          {m.voiceStatus()}
        </div>
      )}
      <div className="text-[10px] text-[var(--jam-text-3)]">
        Instruments réels : soundfont FluidR3 GM de Frank Wen, licence CC BY 3.0. Chargés une fois, puis gardés sur le disque.
      </div>
      <div className="flex flex-wrap gap-3">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.5} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="TIMBRE" value={m.tone} min={0} max={1} defaultValue={0.55} color={C} size={46} led format={pct} onChange={(v) => { m.setTone(v); bump(); }} />
        <Knob label="ÉCHO" value={m.echo} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setEcho(v); bump(); }} />
        <Knob label="BALAYAGE" value={m.sweepDepth} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSweep(v); bump(); }} />
        <Knob label="LARGEUR" value={m.width} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setWidth(v); bump(); }} />
        <JamSeg label="Balayage" color={C} value={String(m.sweepDiv)} options={[["0.5","1/2 t"],["1","1 temps"],["2","2 temps"],["4","1 mesure"]] as const} onChange={(v) => { m.setSweep(m.sweepDepth, Number(v)); bump(); }} />
      </div>
    </section>
  );
}
