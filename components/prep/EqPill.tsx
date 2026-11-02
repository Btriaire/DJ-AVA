"use client";
export interface EqPillProps { hasStems: boolean; ready: boolean; running: boolean; onRun: () => void; }
export function EqPill({ hasStems, ready, running, onRun }: EqPillProps) {
  if (!hasStems) { return null; }
  if (running) { return (<span className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors animate-pulse" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }} title="Analyse spectrale en cours">bandes…</span>); }
  if (ready) { return (<span className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)", boxShadow: "inset 0 0 0 1px rgba(251,191,36,0.4)" }} title="Analyse spectrale prête : recettes 15 bandes disponibles">✓ bandes</span>); }
  return (<button type="button" onClick={onRun} className="whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-bold transition-colors hover:text-white" style={{ borderColor: "rgba(251,191,36,0.55)", color: "#fbbf24" }} title="Mesurer le spectre de ce titre pour les recettes 15 bandes">+ bandes</button>);
}
