"use client";
import { HALLS, type HallName } from "@/lib/audio/concertHall";
import { Knob } from "../Knob";
import type { ClassiqueModule } from "@/lib/audio/classique";

export function ClassiqueSalle({ m, bump, color }: { m: ClassiqueModule; bump: () => void; color: string }) {
  return (
    <div role="group" aria-label="Salle" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { m.setHall(null); bump(); }}
          style={{
            backgroundColor: m.hall === null ? color : "transparent",
            color: m.hall === null ? "oklch(0.18 0.02 80)" : "oklch(0.92 0.01 260)",
            border: m.hall === null ? "none" : "1px solid oklch(0.32 0.015 260)"
          }}
          className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
          aria-pressed={m.hall === null}
        >
          Sans salle
        </button>
        {(Object.keys(HALLS) as HallName[]).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => { m.setHall(k); bump(); }}
            style={{
              backgroundColor: m.hall === k ? color : "transparent",
              color: m.hall === k ? "oklch(0.18 0.02 80)" : "oklch(0.92 0.01 260)",
              border: m.hall === k ? "none" : "1px solid oklch(0.32 0.015 260)"
            }}
            className="rounded px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.15em]"
            aria-pressed={m.hall === k}
          >
            {HALLS[k].label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-[var(--jam-text-3)]">
        {m.hall ? HALLS[m.hall].hint : "Sans réverbération ajoutée."}
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Knob
          label="SALLE"
          value={m.amount}
          min={0}
          max={1}
          onChange={(v) => { m.setAmount(v); bump(); }}
          color={color}
          size={46}
          format={(v) => `${Math.round(v * 100)} %`}
        />
        <Knob
          label="CHALEUR"
          value={m.warmth}
          min={0}
          max={1}
          onChange={(v) => { m.setWarmth(v); bump(); }}
          color={color}
          size={46}
          format={(v) => `${Math.round(v * 100)} %`}
        />
      </div>
      <p className="text-[10px] text-[var(--jam-text-3)]">
        Chaleur : adoucit les aigus de la salle.
      </p>
    </div>
  );
}