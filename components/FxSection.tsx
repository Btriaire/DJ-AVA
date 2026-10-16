import { useState } from "react";
import { FxUnit } from "./FxUnit";
import { RetouchPanel } from "./RetouchPanel";
import { FXRack, DECK_FX } from "@/lib/audio/FXRack";
import { Retouch } from "@/lib/audio/Retouch";

export function FxSection({ rack, retouch, color, dsp }: { rack: FXRack; retouch: Retouch; color: string; dsp: React.ReactNode }) {
  const [open, setOpen] = useState<"" | "retouch" | "dsp">("");

  return (
    <div className="flex flex-col gap-2">
      <FxUnit rack={rack} ids={DECK_FX} color={color} />
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
