"use client";
import { useEffect, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { SLICE_PRESETS, type SlicePresetId } from "@/lib/audio/Slicer";
import { PerfPad } from "./PerfPad";

const STEM_FR: Record<string, string> = {
  drums: "Batterie",
  bass: "Basse",
  other: "Autre",
  vocals: "Voix",
};

export function SlicerPanel({ engine }: { engine: DJEngine }) {
  const [side, setSide] = useState<"A" | "B">("A");
  const [slot, setSlot] = useState(-1);
  const [, setV] = useState(0);
  const [preset, setPreset] = useState<SlicePresetId>("orig");
  const force = () => setV((n) => n + 1);

  useEffect(() => {
    const sl = side === "A" ? engine.slicerA : engine.slicerB;
    sl.listen((n) => setSlot(n));
    return () => { sl.listen(null); };
  }, [engine, side]);

  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem("djsynth.slicer.v1") || "{}");
      if (o.A) engine.slicerA.importState(o.A);
      if (o.B) engine.slicerB.importState(o.B);
      const t0 = setTimeout(() => setV((n) => n + 1), 0);
      return () => clearTimeout(t0);
    } catch {}
    const iv = setInterval(() => setV((n) => n + 1), 400);
    return () => {
      clearInterval(iv);
      engine.slicerA.releaseHold();
      engine.slicerA.release();
      engine.slicerB.releaseHold();
      engine.slicerB.release();
    };
  }, [engine]);

  const deck = side === "A" ? engine.deckA : engine.deckB;
  const sl = side === "A" ? engine.slicerA : engine.slicerB;

  const save = () => {
    try {
      localStorage.setItem("djsynth.slicer.v1", JSON.stringify({
        A: engine.slicerA.exportState(),
        B: engine.slicerB.exportState(),
      }));
    } catch {}
  };

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">SLICER</span>
        <div className="flex gap-1">
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${side === "A" ? "hw-btn-on" : ""}`}
            onClick={() => setSide("A")}
          >
            A
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${side === "B" ? "hw-btn-on" : ""}`}
            onClick={() => setSide("B")}
          >
            B
          </button>
        </div>
      </div>

      <p className="text-[11px] text-neutral-300">
        Découpe la mesure en cours en 8 ou 16 tranches et les rejoue dans un autre ordre, calé sur le tempo. Allume SLICE, puis choisis un motif ; éteins SLICE pour revenir au morceau.
      </p>

      <div className="flex items-center gap-2">
        <span className="text-[9px] font-black tracking-[0.2em] text-neutral-400">SUR QUOI</span>
        <div className="flex flex-wrap gap-1">
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${sl.target === -1 || !(deck.stemsActive && deck.stemReady) ? "hw-btn-on" : ""}`}
            onClick={() => { sl.setTarget(-1); save(); force(); }}
          >
            Tout le morceau
          </button>
          {deck.stemNames.map((name, i) => (
            <button
              key={i}
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${sl.target === i && deck.stemsActive && deck.stemReady ? "hw-btn-on" : ""} disabled:opacity-40`}
              onClick={() => { sl.setTarget(i); save(); force(); }}
              disabled={!(deck.stemsActive && deck.stemReady)}
              title={!(deck.stemsActive && deck.stemReady) ? "Active les stems de la platine" : undefined}
            >
              {STEM_FR[name] ?? name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${sl.engaged ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: "#38bdf8" }}
          onClick={() => { sl.toggle(); force(); }}
          disabled={!deck.playing || !deck.audioBuffer}
        >
          SLICE
        </button>
        <p className="text-[11px] text-neutral-300" aria-live="polite">
          {!deck.playing || !deck.audioBuffer ? "Charge et lance un morceau sur la platine " + side : sl.engaged ? "Tu entends : " + SLICE_PRESETS.find(p => p.id === preset)?.title : "SLICE éteint : le morceau joue normalement"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {SLICE_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${preset === p.id ? "hw-btn-on" : ""}`}
            onClick={() => { sl.applyPreset(p.id); setPreset(p.id); if (!sl.engaged) sl.toggle(); save(); force(); }}
          >
            <span className="block text-[11px] font-black">{p.label}</span>
            <span className="block text-[10px] leading-tight text-neutral-400 text-left">{p.title}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1 justify-center">
          <span className="text-[9px] font-black tracking-[0.2em] text-neutral-400">TRANCHES</span>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${sl.slices === 8 ? "hw-btn-on" : ""}`}
            onClick={() => { sl.setSlices(8); save(); force(); }}
          >
            8
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${sl.slices === 16 ? "hw-btn-on" : ""}`}
            onClick={() => { sl.setSlices(16); save(); force(); }}
          >
            16
          </button>
        </div>

        <div className="flex items-center gap-1 justify-center">
          <span className="text-[9px] font-black tracking-[0.2em] text-neutral-400">DÉCALAGE</span>
          {[0, 1, 2, 3].map((n) => (
            <button
              key={n}
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${sl.barShift === n ? "hw-btn-on" : ""}`}
              onClick={() => { sl.setBarShift(n); save(); force(); }}
              title="Décale le premier temps de la mesure si le découpage n'est pas calé sur le bon temps"
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={`grid gap-1 ${sl.slices === 8 ? "grid-cols-8" : "grid-cols-8 sm:grid-cols-16"}`}>
        {Array.from({ length: sl.slices }).map((_, i) => (
          <PerfPad
            key={i}
            label={String(i + 1)}
            color={`oklch(0.78 0.13 ${Math.round(60 + (i / sl.slices) * 170)})`}
            active={sl.holding === i}
            lit={slot === i}
            onDown={() => { sl.holdSlice(i); force(); }}
            onUp={() => { sl.releaseHold(); force(); }}
            title="Maintiens pour répéter cette tranche en boucle"
          />
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto [contain:inline-size]">
        {Array.from({ length: sl.slices }).map((_, k) => (
          <div
            key={k}
            className="hw-recess flex-1 h-[40px] flex items-center justify-center text-[11px] font-bold cursor-pointer"
            style={{
              backgroundColor: sl.pattern[k] < 0
                ? "transparent"
                : `oklch(0.78 0.13 ${Math.round(60 + (sl.pattern[k] / sl.slices) * 170)} / ${slot === k ? "1" : "0.35"})`,
            }}
            onClick={(e) => {
              sl.cycleStep(k, e.altKey || e.shiftKey ? -1 : 1);
              save();
              force();
            }}
          >
            {sl.pattern[k] < 0 ? "—" : String(sl.pattern[k] + 1)}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-neutral-300">
        Pads : maintiens pour répéter une tranche. Ligne du bas : clic pour changer la tranche jouée à ce pas, Maj+clic en sens inverse, — = silence.
      </p>
    </div>
  );
}
