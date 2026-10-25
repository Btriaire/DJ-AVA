"use client";
import type { SetArc } from "@/lib/setBuilder";
import { arcTarget } from "@/lib/setBuilder";
import { ARC_HINT, ARC_LABEL, ARC_ORDER, durationLabel } from "@/lib/setWizard";

export interface ProgramPanelProps {
  arc: SetArc;
  durationMin: number;
  perArtist: 3 | 5 | 8;
  soloSets: boolean;
  busy: boolean;
  onArc: (arc: SetArc) => void;
  onDuration: (min: number) => void;
  onPerArtist: (n: 3 | 5 | 8) => void;
  onSolo: (on: boolean) => void;
}

export function ProgramPanel({
  arc,
  durationMin,
  perArtist,
  soloSets,
  busy,
  onArc,
  onDuration,
  onPerArtist,
  onSolo,
}: ProgramPanelProps) {

  return (
    <section className="prep-card flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-neutral-200">Programme</h2>
        <p className="text-[12px] text-neutral-400">Comment doit évoluer l&apos;énergie, et combien de temps ça dure.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ARC_ORDER.map((a) => (
          <button
            key={a}
            type="button"
            className="flex flex-col items-center gap-1 rounded border p-2 text-center"
            style={{
              borderColor: arc === a ? "var(--prep-accent)" : "var(--prep-line)",
              backgroundColor: arc === a ? "color-mix(in srgb, var(--prep-accent) 14%, transparent)" : "transparent",
            }}
            aria-pressed={arc === a}
            onClick={() => onArc(a)}
            disabled={busy}
          >
            <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
              <polyline
                points={Array.from({ length: 24 }, (_, i) => `${(i * 100) / 23},${22 - arcTarget(a, i / 23) * 20}`).join(" ")}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className="text-[11px] font-medium">{ARC_LABEL[a]}</span>
          </button>
        ))}
      </div>

      <p className="text-[12px] text-neutral-300">{ARC_HINT[arc]}</p>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[120px]">
          <label htmlFor="duration" className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Durée du set
          </label>
          <select
            id="duration"
            className="prep-input mt-1 w-full px-2 py-1.5 text-xs"
            value={durationMin}
            onChange={(e) => onDuration(Number(e.target.value))}
            disabled={busy}
          >
            {[30, 45, 60, 90, 120, 0].map((min) => (
              <option key={min} value={min}>
                {durationLabel(min)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">
            Titres par artiste
          </label>
          <div className="prep-seg mt-1 flex">
            {([3, 5, 8] as const).map((n) => (
              <button
                key={n}
                type="button"
                className="flex-1 px-2 py-1.5 text-xs"
                aria-pressed={perArtist === n}
                onClick={() => onPerArtist(n)}
                disabled={busy}
              >
                {n === 3 ? "Court · 3" : n === 5 ? "Normal · 5" : "Large · 8"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={soloSets}
          className="relative h-5 w-10 rounded-full bg-[var(--prep-line)] transition-colors"
          style={{ backgroundColor: soloSets ? "var(--prep-accent)" : "var(--prep-line)" }}
          onClick={() => onSolo(!soloSets)}
          disabled={busy}
        >
          <span
            className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
            style={{ transform: soloSets ? "translateX(16px)" : "translateX(0)" }}
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-neutral-100">Un set par artiste en plus</p>
          <p className="text-[11px] text-neutral-400">
            En plus du mix, un set par artiste (3 titres analysés minimum).
          </p>
        </div>
      </div>
    </section>
  );
}
