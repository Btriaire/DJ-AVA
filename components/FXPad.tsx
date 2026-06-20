"use client";
import { useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";
import { FX_LIST, FxName } from "@/lib/audio/FXRack";

interface Props {
  deck: Deck;
  color: string;
}

// One intensity slider per effect — every effect runs in parallel, so you can
// layer several at once. Each slider sends that effect's wet level (0..100%).
export function FXPad({ deck, color }: Props) {
  const [wet, setWet] = useState<Record<FxName, number>>(() =>
    FX_LIST.reduce((acc, fx) => ({ ...acc, [fx.id]: deck.getFxWet(fx.id) }), {} as Record<FxName, number>)
  );
  // last non-zero levels, so the master toggle can restore what you had dialed in
  const lastOn = useRef<Record<FxName, number>>(
    FX_LIST.reduce((acc, fx) => ({ ...acc, [fx.id]: 0.6 }), {} as Record<FxName, number>)
  );

  const set = (id: FxName, v: number) => {
    deck.setFxWet(id, v);
    if (v > 0.001) lastOn.current[id] = v;
    setWet((w) => ({ ...w, [id]: v }));
  };

  const anyOn = FX_LIST.some((fx) => wet[fx.id] > 0.001);

  // one button to light up / kill the whole FX section of this deck
  const toggleAll = () => {
    if (anyOn) {
      // remember the current dialed-in levels, then cut everything
      FX_LIST.forEach((fx) => {
        if (wet[fx.id] > 0.001) lastOn.current[fx.id] = wet[fx.id];
      });
      FX_LIST.forEach((fx) => set(fx.id, 0));
    } else {
      // bring every effect back to its last level (or a sensible default)
      FX_LIST.forEach((fx) => set(fx.id, lastOn.current[fx.id] || 0.6));
    }
  };

  return (
    <div className="zoom-zone flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">FX · intensité</span>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleAll}
            className={`rounded px-2 py-0.5 text-[10px] font-bold transition-colors ${
              anyOn
                ? "bg-emerald-500/80 text-black shadow-[0_0_8px_rgba(77,255,132,.6)]"
                : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
            }`}
            title="Allumer ou éteindre tous les effets de cette platine"
          >
            {anyOn ? "● ALL" : "○ ALL"}
          </button>
          <button
            onClick={() => FX_LIST.forEach((fx) => set(fx.id, 0))}
            className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-bold text-neutral-400 hover:bg-neutral-700"
          >
            RESET
          </button>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-0.5">
        {FX_LIST.map((fx) => {
          const v = wet[fx.id];
          const on = v > 0.001;
          return (
            <div key={fx.id} className="flex flex-col items-center gap-0.5">
              {/* active LED — deck-coloured (orange A / green B), blinks while the fader is up */}
              <span
                className={`h-1.5 w-1.5 rounded-full transition-shadow ${on ? "fx-led-blink" : ""}`}
                style={{
                  background: on ? color : "#27272a",
                  boxShadow: on ? `0 0 5px ${color}, 0 0 2px ${color}` : "inset 0 0 1px #000",
                }}
                aria-hidden
              />
              <div className="flex h-24 items-stretch justify-center gap-0.5">
                <span className="fader-ticks" aria-hidden />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={v}
                  onChange={(e) => set(fx.id, parseFloat(e.target.value))}
                  className="dj-fader dj-fader-v h-24"
                  style={{ accentColor: color }}
                />
                <span className="fader-ticks" aria-hidden />
              </div>
              <span
                className="text-[9px] font-bold leading-none"
                style={{ color: on ? color : "#71717a" }}
              >
                {fx.label}
              </span>
              <span className="text-[8px] tabular-nums text-neutral-600">
                {Math.round(v * 100)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
