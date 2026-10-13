import { useRef, useState, useEffect } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { DjPresetId } from "@/lib/audio/DjSynth";
import { EQ_PRESETS, presetGains } from "@/lib/audio/eqPresets";
import { EQ_FREQS } from "@/lib/audio/Rack";

export function DancePanel({ engine }: { engine: DJEngine }) {
  const [side, setSide] = useState<"A" | "B">("A");
  const [pumpOn, setPumpOn] = useState(false);
  const [rising, setRising] = useState(false);
  const [genre, setGenre] = useState<string | null>(null);
  const riseRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const deck = side === "A" ? engine.deckA : engine.deckB;

  const stopRise = () => {
    if (riseRef.current) {
      clearInterval(riseRef.current);
      riseRef.current = null;
    }
    setRising(false);
  };

  useEffect(() => {
    return () => {
      if (riseRef.current) clearInterval(riseRef.current);
    };
  }, []);

  const handleGenreClick = (name: string, eqId: string, synth: string) => {
    const preset = EQ_PRESETS.find((p) => p.id === eqId);
    if (!preset) return;

    const gains = presetGains(preset.pts, EQ_FREQS);
    EQ_FREQS.forEach((_, i) => {
      deck.rack.setParam("eq", `g${i}`, gains[i]);
    });

    engine.djSynth.setPreset(synth as DjPresetId);
    setGenre(name);
  };

  const handlePumpClick = () => {
    const newState = !pumpOn;
    setPumpOn(newState);
    deck.setStemPump(newState);
  };

  const handleRiseClick = (n: number) => {
    stopRise();
    const bpm = deck.fxClock()?.bpm || deck.bpm || 120;
    const durMs = (60000 / bpm) * n;
    deck.setFxWet("noise", 0);
    const t0 = performance.now();

    riseRef.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / durMs);
      deck.setFxWet("noise", p * p);
      if (p >= 1) stopRise();
    }, 50);
    setRising(true);
  };

  const handleDropClick = () => {
    stopRise();
    deck.setFxWet("noise", 0);
  };

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">DANSE</h2>
        <button
          className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${side === "A" ? "hw-btn-on" : ""}`}
          onClick={() => setSide("A")}
        >
          A
        </button>
        <button
          className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${side === "B" ? "hw-btn-on" : ""}`}
          onClick={() => setSide("B")}
        >
          B
        </button>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-bold mb-2">GENRE</h3>
        <div className="flex gap-2">
          <button
            className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${genre === "HOUSE" ? "hw-btn-on" : ""}`}
            onClick={() => handleGenreClick("HOUSE", "club", "sub")}
          >
            HOUSE
          </button>
          <button
            className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${genre === "TECHNO" ? "hw-btn-on" : ""}`}
            onClick={() => handleGenreClick("TECHNO", "techno", "acid")}
          >
            TECHNO
          </button>
          <button
            className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${genre === "ÉLECTRO" ? "hw-btn-on" : ""}`}
            onClick={() => handleGenreClick("ÉLECTRO", "brillant", "reese")}
          >
            ÉLECTRO
          </button>
          <button
            className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${genre === "HIP-HOP" ? "hw-btn-on" : ""}`}
            onClick={() => handleGenreClick("HIP-HOP", "sub", "sub")}
          >
            HIP-HOP
          </button>
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-sm font-bold mb-2">PUMP STEMS</h3>
        <button
          className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${pumpOn ? "hw-btn-on" : ""}`}
          onClick={handlePumpClick}
          disabled={!deck.stemsActive}
          title="Fait baisser les stems à chaque temps, comme un sidechain. Nécessite le mode stems"
        >
          PUMP STEMS
        </button>
      </div>

      <div>
        <h3 className="text-sm font-bold mb-2">MONTÉE / DROP</h3>
        <div className="flex gap-2">
          <button
            className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
            onClick={() => handleRiseClick(4)}
          >
            MONTÉE 4
          </button>
          <button
            className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
            onClick={() => handleRiseClick(8)}
          >
            MONTÉE 8
          </button>
          <button
            className="hw-btn px-2.5 py-1.5 text-[11px] font-bold"
            onClick={handleDropClick}
          >
            DROP
          </button>
        </div>
        {rising && <p className="text-xs mt-2">MONTÉE EN COURS</p>}
      </div>
    </div>
  );
}
