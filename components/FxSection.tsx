import { useState } from "react";
import { DjFxPanel } from "./DjFxPanel";
import { RetouchPanel } from "./RetouchPanel";
import { FXRack } from "@/lib/audio/FXRack";
import { Retouch } from "@/lib/audio/Retouch";

type Tab = "djfx" | "perfo" | "retouch" | "dsp";

const CAPTIONS: Record<Tab, string> = {
  djfx: "Effets de mix : touche une case pour l'activer ou la couper ; maintiens-la pour un effet momentané (ROLL, BRAKE…).",
  perfo: "Performance : brake, écho de sortie et censor, déclenchés au pad. Maintiens le pad pour l'effet le temps que tu veux.",
  retouch: "Retouche : presets de correction du son. Le bouton Original compare avec le son d'origine.",
  dsp: "Rack DSP : une chaîne de modules détaillés. Clique un module pour le régler, ◀ ▶ pour changer l'ordre.",
};

export function FxSection({
  rack,
  retouch,
  color,
  perfo,
  dsp,
}: {
  rack: FXRack;
  retouch: Retouch;
  color: string;
  perfo: React.ReactNode;
  dsp: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("djfx");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        <button
          className="hw-btn px-2.5 py-1 text-[11px] font-bold"
          style={tab === "djfx" ? { backgroundColor: color, color: "white" } : { opacity: 0.7 }}
          onClick={() => setTab("djfx")}
        >
          DJ FX
        </button>
        <button
          className="hw-btn px-2.5 py-1 text-[11px] font-bold"
          style={tab === "perfo" ? { backgroundColor: color, color: "white" } : { opacity: 0.7 }}
          title="Effets déclenchés au pad : brake, écho de sortie, censor"
          onClick={() => setTab("perfo")}
        >
          PERFO
        </button>
        <button
          className="hw-btn px-2.5 py-1 text-[11px] font-bold"
          style={
            tab === "retouch"
              ? { backgroundColor: color, color: "white" }
              : retouch.isNeutral()
              ? { opacity: 0.7 }
              : { backgroundColor: color, opacity: 0.7 }
          }
          onClick={() => setTab("retouch")}
        >
          RETOUCHE
        </button>
        <button
          className="hw-btn px-2.5 py-1 text-[11px] font-bold"
          style={tab === "dsp" ? { backgroundColor: color, color: "white" } : { opacity: 0.7 }}
          onClick={() => setTab("dsp")}
        >
          RACK DSP
        </button>
      </div>

      <p className="text-[11px] leading-snug text-neutral-400">{CAPTIONS[tab]}</p>
      {tab === "djfx" && <DjFxPanel rack={rack} color={color} />}
      {tab === "perfo" && perfo}
      {tab === "retouch" && <RetouchPanel retouch={retouch} color={color} />}
      {tab === "dsp" && dsp}
    </div>
  );
}
