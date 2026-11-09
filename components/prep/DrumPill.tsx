"use client";
export interface DrumPillProps { hasStems: boolean; ready: boolean; running: boolean; onRun: () => void; }
export function DrumPill({ hasStems, ready, running, onRun }: DrumPillProps) {
  if (!hasStems) { return null; }
  if (running) { return (<span className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors animate-pulse" style={{ color: "#fb923c", background: "rgba(251,146,60,0.12)" }} title="Analyse de batterie en cours">batterie…</span>); }
  if (ready) { return (<span className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors" style={{ color: "#fb923c", background: "rgba(251,146,60,0.12)", boxShadow: "inset 0 0 0 1px rgba(251,146,60,0.4)" }} title="Analyse de batterie prête : recettes de batterie disponibles">✓ batterie</span>); }
  return (<button type="button" onClick={onRun} className="whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-bold transition-colors hover:text-white" style={{ borderColor: "rgba(251,146,60,0.55)", color: "#fb923c" }} title="Mesurer la batterie de ce titre pour les recettes de batterie">+ batterie</button>);
}
