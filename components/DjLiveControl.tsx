"use client";
import { FORCES, FORCE_HINT, FORCE_LABEL } from "@/lib/djForce";
import { setDjLive, useDjLive } from "@/lib/djLive";

// DJ intelligent, always at hand: on / off and its force, in the top bar of every view.
export function DjLiveControl() {
  const live = useDjLive();
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label="DJ intelligent">
      <button
        type="button"
        onClick={() => setDjLive({ on: !live.on })}
        aria-pressed={live.on}
        className={`hw-btn inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold ${live.on ? "hw-btn-on" : ""}`}
        style={{ ["--led" as string]: "#e879f9", color: live.on ? "#e879f9" : undefined }}
        title="DJ intelligent : quand il est actif, il intervient sur les morceaux qui jouent (filtres, échos, réverbs, stems...), sur un set ou sur ce que tu joues à la main. Sa force règle la fréquence et l'intensité."
      >
        DJ {live.on ? "ON" : "OFF"}
      </button>
      <select
        className="hw-btn px-1.5 py-1.5 text-[11px] font-bold"
        value={live.force}
        onChange={(e) => setDjLive({ force: Number(e.target.value) as 1 | 2 | 3 | 4 | 5 })}
        aria-label="Force du DJ intelligent"
        title={FORCE_HINT[live.force]}
      >
        {FORCES.map((f) => (
          <option key={f} value={f}>{`${f} · ${FORCE_LABEL[f]}`}</option>
        ))}
      </select>
      {live.on && live.action && (
        <span className="max-w-[160px] truncate text-[11px] font-bold" style={{ color: "#e879f9" }} title="Dernière intervention du DJ">{`DJ : ${live.action}`}</span>
      )}
    </span>
  );
}
