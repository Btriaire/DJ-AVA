"use client";
import { BLEND_LABEL, VOCAL_GAP_BPM, type DjOptions } from "@/lib/mixPlan";
import { FORCES, FORCE_HINT, FORCE_LABEL, GENRES, GENRE_HINT, GENRE_LABEL, PROFILE, applyForce, forceOf, type DjForce, type Genre } from "@/lib/djForce";

// The force of the intelligent DJ (5 levels) and the length of its blends, the same control in every module.
// Choosing a force sets the DJ options it stands for; the options can be changed one by one afterwards.
export function DjForceControl({ dj, disabled, onChange }: { dj: DjOptions; disabled?: boolean; onChange: (next: DjOptions) => void }) {
  const force = forceOf(dj);
  const blends = Object.keys(BLEND_LABEL) as (keyof typeof BLEND_LABEL)[];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--prep-line)] p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-neutral-100">Force du DJ</span>
        <span className="text-[11px] font-bold" style={{ color: "var(--prep-accent)" }}>{`${force} / 5 · ${FORCE_LABEL[force]}`}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Force du DJ">
        {FORCES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={force === f}
            aria-label={`Force ${f} sur 5 : ${FORCE_LABEL[f]}`}
            disabled={disabled}
            onClick={() => onChange(applyForce(dj, f as DjForce))}
            title={FORCE_HINT[f]}
            className="flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-bold disabled:opacity-50"
            style={{
              borderColor: force === f ? "var(--prep-accent)" : "var(--prep-line)",
              background: force === f ? "color-mix(in srgb, var(--prep-accent) 16%, transparent)" : "transparent",
              color: force === f ? "#fff" : "#9ca3af",
            }}
          >
            <span className="flex h-4 items-end gap-0.5" aria-hidden>
              {FORCES.map((b) => (
                <span key={b} className="w-1 rounded-sm" style={{ height: 4 + b * 2.4, background: b <= f ? "var(--prep-accent)" : "var(--prep-line)" }} />
              ))}
            </span>
            {FORCE_LABEL[f]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400">{FORCE_HINT[force]}</p>
      <p className="text-[10px] text-neutral-500">{`Interventions pendant les morceaux : une toutes les ${PROFILE[force].everyBars} mesures environ.`}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Style joué</span>
        <select
          className="prep-input px-2 py-1 text-[12px]"
          value={dj.genre ?? "auto"}
          disabled={disabled}
          aria-label="Style joué par le DJ"
          onChange={(e) => onChange({ ...dj, genre: e.target.value as Genre })}
        >
          {GENRES.map((g) => (
            <option key={g} value={g}>{GENRE_LABEL[g]}</option>
          ))}
        </select>
        <p className="w-full text-[11px] text-neutral-400">{GENRE_HINT[dj.genre ?? "auto"]}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Couper les voix (stems)</span>
        <select
          className="prep-input px-2 py-1 text-[12px]"
          value={dj.vocalGap ?? VOCAL_GAP_BPM}
          disabled={disabled}
          aria-label="Écart de tempo à partir duquel les voix sont coupées pendant un enchaînement"
          onChange={(e) => onChange({ ...dj, vocalGap: Number(e.target.value) })}
        >
          {[0, 3, 6, 8, 10, 12, 15, 20].map((n) => (
            <option key={n} value={n}>{n === 0 ? "Jamais" : `à partir de ${n} BPM d'écart`}</option>
          ))}
        </select>
        <p className="w-full text-[11px] text-neutral-400">Quand deux morceaux sont trop éloignés en tempo, leurs voix se superposent mal : elles sont coupées pendant l'enchaînement (si les stems sont prêts).</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.15em] text-neutral-500">Durée des fondus</span>
        <div className="prep-seg" role="group" aria-label="Durée des fondus">
          {blends.map((b) => (
            <button key={b} type="button" aria-pressed={(dj.blend ?? "normal") === b} disabled={disabled} onClick={() => onChange({ ...dj, blend: b })}>
              {BLEND_LABEL[b]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
