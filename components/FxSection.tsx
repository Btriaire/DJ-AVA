import { useState } from "react";
import { FxUnit } from "./FxUnit";
import { RetouchPanel } from "./RetouchPanel";
import { FXRack, DECK_FX } from "@/lib/audio/FXRack";
import { STEM_FX } from "@/lib/audio/fxTypes";
import { Retouch } from "@/lib/audio/Retouch";
import type { Deck } from "@/lib/audio/Deck";
import { stemLabel } from "./RackGuideBlock";

export function FxSection({ deck, rack, retouch, color, dsp, storageKey }: { deck?: Deck; rack: FXRack; retouch: Retouch; color: string; dsp: React.ReactNode; storageKey?: string }) {
  const [open, setOpen] = useState<"" | "retouch" | "dsp">("");
  const [target, setTarget] = useState(-1); // -1 = the whole deck, i = stem i (each stem has its own DJ FX)
  const stemRack = deck && target >= 0 ? deck.stemFxRack(target) : null;
  const unitRack = stemRack ?? rack;

  return (
    <div className="flex flex-col gap-2">
      {deck && deck.stemNames.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-16 shrink-0 text-[9px] font-bold uppercase tracking-wider text-neutral-400">Sur quoi</span>
          {[-1, ...deck.stemNames.map((_, i) => i)].map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={target === c}
              onClick={() => setTarget(c)}
              className="rounded px-2 py-1 text-[10px] font-bold"
              style={target === c ? { background: color, color: "#0a0a0a" } : { background: "rgba(255,255,255,0.08)", color: "#d4d4d4" }}
              title={c < 0 ? "Les effets DJ sur tout le deck" : "Les effets DJ sur ce stem seul (les autres restent secs)"}
            >
              {c < 0 ? "Tout le morceau" : stemLabel(deck.stemNames[c])}
            </button>
          ))}
          {target >= 0 && !deck.stemsActive && <span className="text-[10px] text-amber-300">Active les stems pour entendre l&apos;effet sur ce stem.</span>}
        </div>
      )}
      <FxUnit key={target} rack={unitRack} ids={stemRack ? STEM_FX : DECK_FX} color={color} storageKey={storageKey && (target < 0 ? storageKey : `${storageKey}.stem${target}`)} />
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className="hw-btn px-2.5 py-1 text-[11px] font-bold"
          style={open === "retouch" ? { backgroundColor: color, color: "white" } : retouch.isNeutral() ? { opacity: 0.7 } : { backgroundColor: color, opacity: 0.7 }}
          title="Presets de correction du son ; le bouton Original compare avec le son d'origine"
          onClick={() => setOpen(open === "retouch" ? "" : "retouch")}
        >
          RETOUCHE
        </button>
        <button
          type="button"
          className="hw-btn px-2.5 py-1 text-[11px] font-bold"
          style={open === "dsp" ? { backgroundColor: color, color: "white" } : { opacity: 0.7 }}
          title="Rack DSP : chaîne de modules studio détaillés"
          onClick={() => setOpen(open === "dsp" ? "" : "dsp")}
        >
          RACK DSP
        </button>
      </div>
      {open === "retouch" && <RetouchPanel retouch={retouch} color={color} />}
      {open === "dsp" && dsp}
    </div>
  );
}
