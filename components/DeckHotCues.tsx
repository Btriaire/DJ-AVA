"use client";
import { Deck } from "@/lib/audio/Deck";
import { PerfPad } from "./PerfPad";
import { HoldButton } from "./HoldButton";

export function DeckHotCues({ deck, color, onChange }: { deck: Deck; color: string; onChange: () => void }) {
  const fmt = (sec: number): string => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">REPÈRES</div>
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1">
            <PerfPad
              label={String(i + 1)}
              sub={deck.hotCues[i] != null ? fmt(deck.hotCues[i]!) : "SET"}
              color={color}
              height={48}
              active={false}
              lit={deck.hotCues[i] != null}
              disabled={!deck.name}
              title={`Repère ${i+1} : tape pour poser ou aller au repère, maintiens la croix pour l'effacer`}
              onDown={() => {
                if (deck.hotCues[i] == null) deck.setHotCue(i);
                else deck.gotoHotCue(i);
                onChange();
              }}
            />
            {deck.hotCues[i] != null && (
              <HoldButton
                label="effacer"
                title={`Maintiens pour effacer le repère ${i+1}`}
                holdMs={600}
                onConfirm={() => {
                  deck.clearHotCue(i);
                  onChange();
                }}
                className="hw-btn w-full px-1 py-1 text-[10px] font-bold disabled:opacity-40"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
