"use client";
import { useEffect } from "react";
import type { ClassiqueModule } from "@/lib/audio/classique";

export function ClassiqueDynamique({ m, bump, color }: { m: ClassiqueModule; bump: () => void; color: string }) {
  useEffect(() => {
    const interval = setInterval(() => {
      m.sampleDynamics();
      bump();
    }, 250);
    return () => clearInterval(interval);
  }, [m]);

  const d = m.dynamics();
  const crestDb = d?.crestDb ?? 0;
  const peakDb = d?.peakDb ?? 0;
  const rmsDb = d?.rmsDb ?? 0;
  const crestWidth = Math.min(100, crestDb / 30 * 100);

  return (
    <div className="flex flex-col gap-2">
      {d ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded bg-[oklch(0.25_0.012_260)] overflow-hidden">
              <div
                className="h-full"
                style={{ width: `${crestWidth}%`, backgroundColor: color }}
                role="meter"
                aria-valuemin={0}
                aria-valuemax={30}
                aria-valuenow={Math.round(crestDb)}
                aria-label="Dynamique en décibels"
              />
            </div>
            <span className="font-mono text-[13px] tabular-nums text-neutral-100">{`${crestDb.toFixed(0)} dB`}</span>
          </div>
          <p className="text-[12px] text-neutral-100">
            {crestDb < 8 ? "Son très compressé" : crestDb < 14 ? "Dynamique modérée" : "Large dynamique, adaptée au classique"}
          </p>
          <p className="text-[10px] text-[var(--jam-text-3)]">
            Crête {peakDb.toFixed(1)} dB · niveau moyen {rmsDb.toFixed(1)} dB. Le limiteur ne retient que les crêtes au-dessus de -2 dB.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-[var(--jam-text-3)]">
          Lance un morceau pour mesurer la dynamique.
        </p>
      )}
    </div>
  );
}