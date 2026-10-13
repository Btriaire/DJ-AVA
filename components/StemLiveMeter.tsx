"use client";
import { useEffect, useRef } from "react";
import type { Deck } from "@/lib/audio/Deck";

export function StemLiveMeter({ deck, i, color }: { deck: Deck; i: number; color: string }) {
  const segments = useRef<(HTMLSpanElement | null)[]>([]);
  const lastTime = useRef(0);

  useEffect(() => {
    let rafId: number;
    const update = (time: number) => {
      if (document.hidden) {
        rafId = requestAnimationFrame(update);
        return;
      }

      if (time - lastTime.current < 33) {
        rafId = requestAnimationFrame(update);
        return;
      }
      lastTime.current = time;

      const level = deck.stemLevel(i);
      const lit = Math.round(Math.min(1, level) * 6);

      segments.current.forEach((seg, s) => {
        if (!seg) return;
        const on = s < lit;
        const segColor = s >= 5 ? "#ff4d4d" : s >= 3 ? "#ffd23d" : color;

        seg.style.background = on ? segColor : "#241f18";
        seg.style.boxShadow = on ? `0 0 4px ${segColor}` : "none";
        seg.style.opacity = on ? "1" : "0.55";
      });

      rafId = requestAnimationFrame(update);
    };

    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [deck, i, color]);

  return (
    <div className="flex flex-col-reverse items-center gap-[1.5px]" aria-hidden>
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
