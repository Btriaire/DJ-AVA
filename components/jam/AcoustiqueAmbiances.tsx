"use client";
import { Knob } from "../Knob";
import { PRESETS, type PresetName, type SessionModule } from "@/lib/audio/session";
import type { ClassiqueModule } from "@/lib/audio/classique";

export function AcoustiqueAmbiances({ m, c, bump, color }: { m: SessionModule; c: ClassiqueModule; bump: () => void; color: string }) {
  const noteNames = ["Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const formatPercent = (v: number) => `${Math.round(v * 100)} %`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] text-[var(--jam-text-3)]">Instrument</div>
        <div role="group" aria-label="Préréglage d'instrument" className="flex flex-wrap gap-1.5">
          {(Object.keys(PRESETS) as PresetName[]).map(k => (
            <button
              key={k}
              type="button"
              aria-pressed={m.preset === k}
              onClick={() => {
                m.applyPreset(k);
                c.setHall(PRESETS[k].hall);
                c.setAmount(PRESETS[k].space);
                bump();
              }}
              className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
              style={m.preset === k ? { backgroundColor: color, color: "oklch(0.18 0.02 165)", border: "1px solid transparent" } : { backgroundColor: "transparent", color: "oklch(0.92 0.01 260)", border: "1px solid oklch(0.32 0.015 260)" }}
            >
              {PRESETS[k].label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-[10px] text-[var(--jam-text-3)]">Ambiances sous la lecture</div>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Knob label="PLUIE" value={m.levels.rain} min={0} max={1} defaultValue={0} onChange={v => { m.setLevel("rain", v); bump(); }} color={color} size={46} format={formatPercent} led />
          <Knob label="VENT" value={m.levels.wind} min={0} max={1} defaultValue={0} onChange={v => { m.setLevel("wind", v); bump(); }} color={color} size={46} format={formatPercent} led />
          <Knob label="NAPPE" value={m.levels.drone} min={0} max={1} defaultValue={0} onChange={v => { m.setLevel("drone", v); bump(); }} color={color} size={46} format={formatPercent} led />
          <Knob label="BOL" value={m.levels.bowl} min={0} max={1} defaultValue={0} onChange={v => { m.setLevel("bowl", v); bump(); }} color={color} size={46} format={formatPercent} led />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="tonalité" className="text-[12px] text-[var(--jam-text)]">Tonalité</label>
        <select
          id="tonalité"
          value={m.root % 12}
          onChange={e => { m.setRoot(36 + parseInt(e.target.value)); bump(); }}
          className="bg-[oklch(0.21_0.012_260)] text-[oklch(0.92_0.01_260)] border border-[oklch(0.32_0.015_260)] rounded px-2 py-1 text-[12px]"
        >
          {noteNames.map((name, i) => (
            <option key={i} value={i}>{name}</option>
          ))}
        </select>
        <div className="text-[10px] text-[var(--jam-text-3)]">La nappe et le bol suivent cette note.</div>
      </div>
    </div>
  );
}