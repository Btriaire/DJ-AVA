"use client";
import { useEffect } from "react";
import { LevelPicker } from "./LevelPicker";
import type { ClassiqueModule } from "@/lib/audio/classique";

export function ClassiqueEnchainement({ m, bump, color }: { m: ClassiqueModule; bump: () => void; color: string }) {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    if (m.fadeRunning) {
      intervalId = setInterval(bump, 200);
    }
    return () => {
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [m, m.fadeRunning]);

  const fadeDurations = [5, 10, 20, 30, 45];
  const fadeIndex = fadeDurations.indexOf(m.fadeSec);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <LevelPicker
          label="Fondu"
          names={["5 s", "10 s", "20 s", "30 s", "45 s"]}
          index={fadeIndex}
          onChange={(i) => { m.setFadeSec(fadeDurations[i]); bump(); }}
          color={color}
        />
        {!m.fadeRunning ? (
          <button
            type="button"
            onClick={() => { m.startFade(); bump(); }}
            className="rounded px-3 py-2 text-[12px] font-black uppercase tracking-[0.15em]"
            style={{ backgroundColor: color, color: "oklch(0.18 0.02 80)" }}
          >
            Enchaîner vers la platine {m.fadeTarget()}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { m.cancelFade(); bump(); }}
            className="rounded px-3 py-2 text-[12px] font-black uppercase tracking-[0.15em]"
            style={{ backgroundColor: color, color: "oklch(0.18 0.02 80)" }}
          >
            Annuler
          </button>
        )}
      </div>
      {m.fadeRunning && (
        <div className="h-1.5 w-full rounded overflow-hidden" style={{ backgroundColor: "oklch(0.32 0.015 260)" }}>
          <div
            className="h-full rounded"
            style={{ width: `${m.fadeProgress() * 100}%`, backgroundColor: color }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(m.fadeProgress() * 100)}
            aria-label="Progression du fondu"
          />
        </div>
      )}
      <p className="text-[10px] text-[var(--jam-text-3)]">
        Fondu long entre les deux platines : la platine d&apos;arrivée démarre au début, la précédente s&apos;arrête à la fin.
      </p>
    </div>
  );
}