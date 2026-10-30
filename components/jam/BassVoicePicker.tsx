"use client";
import { INSTRUMENTS, instrument, type InstrumentFamily } from "@/lib/sampleFont";

// every instrument that reaches the bass register can play the line, grouped like the Synth's list
export function BassVoicePicker({ value, onChange, color }: { value: string; onChange: (id: string) => void; color: string }) {
  const QUICK: [string, string][] = [["", "Synthé"], ["electric_bass_finger", "Basse aux doigts"], ["sfz_upright_bass", "Contrebasse"], ["slap_bass_1", "Slap"], ["fretless_bass", "Fretless"], ["mk_synth_bass_1", "Synthé réel"], ["tuba", "Tuba"], ["sfz_steinway", "Piano"]];
  const FAMILIES: InstrumentFamily[] = ["Basses", "Acoustique", "Claviers", "Cordes", "Cuivres", "Orchestre", "Guitares", "Percussions mélodiques", "Vents", "Monde", "Nappes", "Voix"];
  const instruments = INSTRUMENTS.filter(i => i.lo <= 48);
  const n = instruments.length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="rounded-md px-2 py-1 text-[11px] font-bold"
            aria-pressed={value === id}
            style={value === id ? { background: `color-mix(in srgb, ${color} 35%, #111)`, color: "#fff", boxShadow: `inset 0 0 0 1px ${color}` } : { background: "rgba(255,255,255,.06)", color: "var(--jam-text-2)" }}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <select
        aria-label="Son de la basse"
        className="rounded-md px-2 py-1.5 text-[12px] font-bold"
        style={{ background: "oklch(0.21 0.01 280)", color: "var(--jam-text)", border: "1px solid var(--jam-line)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Synthé (caractère)</option>
        {FAMILIES.map(family => {
          const familyInstruments = instruments.filter(i => i.family === family);
          if (familyInstruments.length === 0) return null;
          return (
            <optgroup key={family} label={family}>
              {familyInstruments.map(i => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <div className="text-[10px] text-[var(--jam-text-3)]">
        {`${n} sons qui descendent dans le grave${value ? ` · ${instrument(value)?.label ?? ""}` : ""}`}
      </div>
    </div>
  );
}
