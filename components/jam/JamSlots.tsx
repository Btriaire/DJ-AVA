"use client";
import { useReducer } from "react";
import type { MouseEvent } from "react";

export function JamSlots({ m, color }: { m: { slotNames: () => (string | null)[]; saveSlot: (i: number) => void; loadSlot: (i: number) => void; clearSlot: (i: number) => void; armedSlot: () => number | null }; color: string }) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const slotNames = m.slotNames();
  const armed = m.armedSlot();

  const handleClick = (i: number, e: MouseEvent<HTMLButtonElement>) => {
    if (e.altKey) m.clearSlot(i);
    else if (e.shiftKey) m.saveSlot(i);
    else if (slotNames[i] === null) m.saveSlot(i);
    else m.loadSlot(i);
    bump();
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">SCÈNES</div>
      <div className="flex gap-1">
        {["A", "B", "C", "D"].map((label, i) => {
          const isEmpty = slotNames[i] === null;
          const isArmed = armed === i;
          const baseStyle = {
            border: isEmpty ? "1px dashed var(--jam-line)" : undefined,
            color: isEmpty ? "var(--jam-text-3)" : "var(--jam-text)",
          };
          const filledStyle = !isEmpty ? {
            background: `color-mix(in srgb, ${color} 22%, #111)`,
            boxShadow: isArmed
              ? `inset 0 0 0 2px ${color}, 0 0 10px ${color}`
              : `inset 0 0 0 1px ${color}`,
          } : {};

          return (
            <button
              key={label}
              type="button"
              className={`h-9 w-9 rounded-md font-black text-[13px] ${isArmed ? "animate-pulse motion-reduce:animate-none" : ""}`}
              style={{ ...baseStyle, ...filledStyle }}
              onClick={e => handleClick(i, e)}
              title={isEmpty ? `Enregistrer la scène ${label}` : `Rappeler la scène ${label} (à la mesure)`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="text-[10px] text-[var(--jam-text-3)]">Clic : enregistrer (vide) ou rappeler · Maj+clic : remplacer · Alt+clic : effacer</div>
    </div>
  );
}
