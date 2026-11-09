"use client";
export interface VoicePillProps { hasStems: boolean; ready: boolean; running: boolean; onRun: () => void; }
export function VoicePill({ hasStems, ready, running, onRun }: VoicePillProps) {
  if (!hasStems) { return null; }
  if (running) { return (<span className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors animate-pulse" style={{ color: "#a5b4fc", background: "rgba(165,180,252,0.12)" }} title="Analyse de la voix en cours">voix…</span>); }
  if (ready) { return (<span className="whitespace-nowrap rounded-full px-2 py-px text-[10px] font-bold transition-colors" style={{ color: "#a5b4fc", background: "rgba(165,180,252,0.12)", boxShadow: "inset 0 0 0 1px rgba(165,180,252,0.4)" }} title="Analyse de la voix prête : phrases, syllabes, sifflantes, souffles">✓ voix</span>); }
  return (<button type="button" onClick={onRun} className="whitespace-nowrap rounded-full border px-2 py-px text-[10px] font-bold transition-colors hover:text-white" style={{ borderColor: "rgba(165,180,252,0.55)", color: "#a5b4fc" }} title="Analyser la voix de ce titre pour les chops du module Voix du morceau">+ voix</button>);
}
