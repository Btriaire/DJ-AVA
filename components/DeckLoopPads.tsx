"use client";
import { Deck } from "@/lib/audio/Deck";
import { PerfPad } from "./PerfPad";

export function DeckLoopPads({ deck, color, loop, setLoop, onChange }: { deck: Deck; color: string; loop: number; setLoop: (b: number) => void; onChange: () => void }) {
  const beats = [1/8, 1/4, 1/2, 1, 2, 4, 8, 16];
  const labels = ["1/8", "1/4", "1/2", "1", "2", "4", "8", "16"];

  return (
    <div>
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">BOUCLE</div>
      <div className="grid grid-cols-4 gap-1.5">
        {beats.map((b, i) => (
          <PerfPad
            key={i}
            label={labels[i]}
            color={color}
            height={40}
            lit={loop === b}
            active={loop === b}
            disabled={!deck.name || !deck.bpm}
            title="Boucle de N temps (tape pour activer, retape pour sortir)"
            onDown={() => {
              if (loop === b) {
                deck.clearLoop();
                setLoop(0);
              } else {
                deck.setBeatLoop(b);
                setLoop(b);
              }
              onChange();
            }}
          />
        ))}
      </div>
    </div>
  );
}
