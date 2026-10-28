"use client";
import { useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { applyAny, deleteModulePreset, getModulePreset, listModulePresets, saveModulePreset, snapshotAny, type PresetModuleId } from "@/lib/modulePresets";

// save the whole module under a name, recall it, delete it; the rhythm links use the same presets
export function ModulePresetBar({ engine, id, label, onApplied }: { engine: DJEngine; id: "djsynth" | "supersampler"; label: string; onApplied?: () => void }) {
  const [, bump] = useState(0);
  const deck = engine.deckA;
  const sel = "min-h-8 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200";
  const names = listModulePresets(id);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={`Préréglages ${label}`}>
      <select aria-label={`Préréglages ${label}`} className={sel} value="" onChange={(e) => {
        const p = getModulePreset(id, e.target.value);
        if (p) { applyAny(engine, deck.rack, id as PresetModuleId, p, 80); bump((n) => n + 1); setTimeout(() => onApplied?.(), 150); }
      }}>
        <option value="">Préréglages…</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button type="button" className="prep-btn min-h-8 px-2 text-xs" onClick={() => {
        const name = window.prompt(`Nom du préréglage de ${label} ?`);
        if (!name) return;
        saveModulePreset(id, name, snapshotAny(engine, deck.rack, id));
        bump((n) => n + 1);
      }}>Enregistrer</button>
      <select aria-label="Supprimer un préréglage" className={sel} value="" onChange={(e) => {
        if (!e.target.value || !window.confirm(`Supprimer « ${e.target.value} » ?`)) return;
        deleteModulePreset(id, e.target.value);
        bump((n) => n + 1);
      }}>
        <option value="">Suppr…</option>
        {names.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}
