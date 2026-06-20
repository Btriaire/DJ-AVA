"use client";
import { useEffect, useRef, useState } from "react";
import { Deck } from "@/lib/audio/Deck";

interface Props {
  deckA: Deck;
  deckB: Deck;
  colorA: string;
  colorB: string;
}

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms));
  const m = Math.floor(t / 60000)
    .toString()
    .padStart(2, "0");
  const s = Math.floor((t % 60000) / 1000)
    .toString()
    .padStart(2, "0");
  const cs = Math.floor((t % 1000) / 10)
    .toString()
    .padStart(2, "0");
  return { m, s, cs };
}

// Top-of-rack twin chronos — one per deck. Each runs automatically while its
// deck is playing (no manual start) and accumulates total play time; RAZ resets
// it. Styled like the LcdClock so it sits next to it in the header.
export function DeckTimers({ deckA, deckB, colorA, colorB }: Props) {
  const accA = useRef(0); // accumulated play ms, deck A
  const accB = useRef(0);
  const nameA = useRef(deckA.name); // last loaded track — change = new single = reset
  const nameB = useRef(deckB.name);
  const last = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    last.current = performance.now();
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const dt = now - last.current;
      last.current = now;
      let changed = false;
      // a new single loaded on a deck restarts that deck's chrono at 0
      if (deckA.name !== nameA.current) {
        nameA.current = deckA.name;
        accA.current = 0;
        changed = true;
      }
      if (deckB.name !== nameB.current) {
        nameB.current = deckB.name;
        accB.current = 0;
        changed = true;
      }
      if (deckA.playing) accA.current += dt;
      if (deckB.playing) accB.current += dt;
      if (changed || deckA.playing || deckB.playing) force((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [deckA, deckB]);

  const cell = (label: string, color: string, ms: number, onRaz: () => void) => {
    const t = fmt(ms);
    return (
      <div className="flex items-center gap-1.5">
        <div className="flex flex-col items-center leading-none">
          <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-neutral-600">
            {label}
          </span>
          <span className="hw-led font-mono text-base font-bold tabular-nums" style={{ color }}>
            {t.m}:{t.s}
            <span style={{ opacity: 0.6 }}>.{t.cs}</span>
          </span>
        </div>
        <button
          onClick={onRaz}
          className="hw-btn px-1.5 py-0.5 text-[9px] text-neutral-300"
          title="Remettre ce chrono à zéro"
        >
          RAZ
        </button>
      </div>
    );
  };

  return (
    <div className="hw-screen flex items-center gap-3 px-3 py-1.5">
      {cell("Deck A", colorA, accA.current, () => {
        accA.current = 0;
        force((n) => n + 1);
      })}
      <div className="h-8 w-px bg-[#19324a]" />
      {cell("Deck B", colorB, accB.current, () => {
        accB.current = 0;
        force((n) => n + 1);
      })}
    </div>
  );
}
