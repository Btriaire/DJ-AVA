"use client";
import { useEffect, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import StemMapView from "./StemMapView";

// The map of the songs on the decks (peaks, slow parts, blanks, per-stem cascade), under the line of the next songs
// of the Console. Shown for the decks that have a map; the playhead follows the song.
type Side = "A" | "B";
interface Snap { map: NonNullable<DJEngine["deckA"]["stemMap"]>; pos: number; name: string; playing: boolean }

const read = (engine: DJEngine, side: Side): Snap | null => {
  const d = side === "A" ? engine.deckA : engine.deckB;
  return d.stemMap ? { map: d.stemMap, pos: d.position(), name: d.name, playing: d.playing } : null;
};

export function DeckMaps({ engine }: { engine: DJEngine }) {
  const [snap, setSnap] = useState<Record<Side, Snap | null>>({ A: null, B: null });
  useEffect(() => {
    const id = window.setInterval(() => setSnap({ A: read(engine, "A"), B: read(engine, "B") }), 300);
    return () => window.clearInterval(id);
  }, [engine]);
  const sides = (["A", "B"] as const).filter((s) => snap[s]);
  if (!sides.length) return null;
  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-2 px-3 pb-2 sm:grid-cols-2" aria-label="Cartes des morceaux : pics, passages lents, blancs">
      {sides.map((s) => (
        <div key={s} className="min-w-0">
          <div className="mb-0.5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: s === "A" ? "#38bdf8" : "#fbbf24" }}>
            <span>Deck {s}</span>
            <span className="truncate font-normal normal-case tracking-normal text-zinc-400">{snap[s]!.name}</span>
          </div>
          <StemMapView map={snap[s]!.map} position={snap[s]!.pos} height={84} label={`Carte du deck ${s}`} />
        </div>
      ))}
    </div>
  );
}
