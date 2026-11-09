"use client";
import { useEffect } from "react";
import { LevelPicker } from "./LevelPicker";
import { ARCS, type ArcName } from "@/lib/audio/sessionArc";
import type { SessionModule } from "@/lib/audio/session";

export function AcoustiqueMinuteur({ m, bump, color }: { m: SessionModule; bump: () => void; color: string }) {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (m.timerRunning) {
      interval = setInterval(bump, 500);
    }
    return () => { if (interval) clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.timerRunning]);

  const durationNames = ["10 min", "20 min", "30 min", "45 min", "60 min", "90 min"];
  const durationValues = [10, 20, 30, 45, 60, 90];
  const fadeNames = ["30 s", "1 min", "2 min", "3 min"];
  const fadeValues = [30, 60, 120, 180];

  const formatTime = (s: number | null) => {
    if (s === null) return "--:--"; s = Math.ceil(s);
    if (s <= 0) return "Terminé";
    const minutes = Math.floor(s / 60);
    const seconds = s % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col gap-3">
      <LevelPicker label="Arc" names={(Object.keys(ARCS) as ArcName[]).map(k => ARCS[k].label)} index={(Object.keys(ARCS) as ArcName[]).indexOf(m.arc)} onChange={i => { m.setArc((Object.keys(ARCS) as ArcName[])[i]); bump(); }} color={color} />
      <p className="text-[10px] text-[var(--jam-text-3)]">{ARCS[m.arc].hint}. Appliqué aux ambiances pendant la session.</p>
      <LevelPicker label="Durée" names={durationNames} index={durationValues.indexOf(m.minutes)} onChange={i => { m.setMinutes(durationValues[i]); bump(); }} color={color} />
      <LevelPicker label="Fondu final" names={fadeNames} index={fadeValues.indexOf(m.fadeSec)} onChange={i => { m.setFadeSec(fadeValues[i]); bump(); }} color={color} />
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="button" className="rounded px-4 py-2 text-[12px] font-black uppercase tracking-[0.18em]" style={{ backgroundColor: color, color: "oklch(0.18 0.02 80)" }} onClick={() => { if (m.timerRunning) m.cancelTimer(); else m.startTimer(); bump(); }}>{m.timerRunning ? "Annuler" : "Démarrer la séance"}</button>
        <output role="timer" aria-live="off" className="font-mono text-2xl tabular-nums text-neutral-100">{m.timerRunning ? formatTime(m.remaining()) : `${m.minutes.toString().padStart(2, "0")}:00`}</output>
      </div>
      <p className="text-[10px] text-[var(--jam-text-3)]">À la fin, la musique s&apos;éteint en fondu. Annuler rend le volume.</p>
    </div>
  );
}