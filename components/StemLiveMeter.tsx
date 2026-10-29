"use client";
import { useRef } from "react";
import { useFrameLoop } from "./frameLoop";
import type { Deck } from "@/lib/audio/Deck";

export function StemLiveMeter({ deck, i, color }: { deck: Deck; i: number; color: string }) {
  const segments = useRef<(HTMLSpanElement | null)[]>([]);
  const meterRef = useRef<HTMLDivElement>(null);

  useFrameLoop(meterRef, () => {
    const lit = Math.round(Math.min(1, deck.stemLevel(i)) * 6);
    segments.current.forEach((seg, s) => {
      if (!seg) return;
      const on = s < lit;
      const segColor = s >= 5 ? "#ff4d4d" : s >= 3 ? "#ffd23d" : color;
      seg.style.background = on ? segColor : "#241f18";
      seg.style.boxShadow = on ? `0 0 4px ${segColor}` : "none";
      seg.style.opacity = on ? "1" : "0.55";
    });
  });

  return (
    <div ref={meterRef} className="flex flex-col-reverse items-center gap-[1.5px]" aria-hidden>
      {Array.from({ length: 6 }).map((_, s) => (
        <span
          key={s}
          ref={(el) => { segments.current[s] = el; }}
          className="h-[3px] w-3 rounded-[1px]"
        />
      ))}
    </div>
  );
}
