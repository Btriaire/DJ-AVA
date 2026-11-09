"use client";

import { useSyncExternalStore } from "react";
import { getPrepModel, setPrepModel, subscribePrep, type PrepModel } from "@/lib/stemPrep";

const CHOICES: { id: PrepModel; label: string; title: string }[] = [
  { id: "htdemucs", label: "4 pistes", title: "Batterie, basse, voix, autres : plus rapide" },
  { id: "htdemucs_6s", label: "6 pistes", title: "Batterie, basse, voix, guitare, piano, autres : plus long à préparer" },
];

// 4 or 6 tracks for the next stems preparations (remembered; songs already prepared keep their stems)
export function PrepModelSwitch({ compact = false }: { compact?: boolean }) {
  const model = useSyncExternalStore(subscribePrep, getPrepModel, () => "htdemucs_6s" as PrepModel);
  return (
    <div role="radiogroup" aria-label="Nombre de pistes des stems préparés" className="inline-flex overflow-hidden rounded-md border border-[var(--prep-line,#2a2f38)]">
      {CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          role="radio"
          aria-checked={model === c.id}
          onClick={() => setPrepModel(c.id)}
          title={c.title}
          className={`${compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs"} font-bold transition-colors`}
          style={model === c.id ? { background: "var(--prep-accent, #34d399)", color: "#050505" } : { color: "#a3a3a3" }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
