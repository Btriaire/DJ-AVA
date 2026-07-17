"use client";
import { Deck } from "@/lib/audio/Deck";

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

interface Props {
  deck: Deck;
  color: string;
  side: "A" | "B";
  trackNo?: number; // 1-based position in the set
  trackCount?: number;
  nextName?: string | null;
  onPrev: () => void;
  onPlayPause: () => void;
  onNext: () => void;
}

// A big 90s-style front-facing CD player: brushed-metal face, spinning disc
// window, wide dot-matrix LCD with track / time / BPM, progress bar and a
// "NEXT" readout, plus large ⏮ ▶/⏸ ⏭ transport keys — an at-a-glance
// "what's playing / what's coming" panel for the set, à la an Edjay deck.
export function CdPlayerFace({ deck, color, side, trackNo, trackCount, nextName, onPrev, onPlayPause, onNext }: Props) {
  const dur = deck.duration || 0;
  const pos = Math.min(dur, deck.position ? deck.position() : 0);
  const pct = dur > 0 ? (pos / dur) * 100 : 0;
  const remain = Math.max(0, dur - pos);
  const playing = deck.playing;
  const loaded = !!deck.name;

  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl p-3.5"
      style={{
        background:
          "linear-gradient(180deg, #26262a 0%, #17171a 40%, #0c0c0e 100%)",
        border: "1px solid #000",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -2px 8px rgba(0,0,0,0.7), 0 6px 16px rgba(0,0,0,0.55)",
      }}
    >
      <style>{`@keyframes cdspin { to { transform: rotate(360deg); } }`}</style>

      {/* top row: spinning disc + LCD screen */}
      <div className="flex items-stretch gap-3.5">
        {/* spinning disc window */}
        <div
          className="relative h-28 w-28 shrink-0 overflow-hidden rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 42%, #33333a 0%, #17171a 55%, #050505 100%)",
            border: "2px solid #000",
            boxShadow: "inset 0 0 14px rgba(0,0,0,0.9), 0 0 0 3px #0a0a0a, 0 2px 6px rgba(0,0,0,0.6)",
          }}
        >
          {/* iridescent data surface */}
          <div
            className="absolute inset-2 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, ${color}33 0deg, transparent 35deg, ${color}55 80deg, transparent 130deg, ${color}33 180deg, transparent 230deg, ${color}55 290deg, ${color}33 360deg)`,
              animation: playing ? "cdspin 1.8s linear infinite" : "none",
              opacity: loaded ? 1 : 0.3,
            }}
          />
          {/* subtle concentric grooves */}
          <div
            className="absolute inset-4 rounded-full"
            style={{ boxShadow: `inset 0 0 0 1px ${color}22, inset 0 0 0 6px rgba(0,0,0,0.25)` }}
          />
          {/* centre hub */}
          <div
            className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: "radial-gradient(circle at 45% 40%, #2a2a2e, #050505)",
              boxShadow: `0 0 10px ${color}77, inset 0 0 3px #000, 0 0 0 2px #0a0a0a`,
            }}
          />
          <div
            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "#050505", boxShadow: "inset 0 0 2px #000" }}
          />
        </div>

        {/* LCD readout */}
        <div
          className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 rounded-lg px-3 py-2"
          style={{
            background: "linear-gradient(180deg, #0a0f0a 0%, #060906 100%)",
            boxShadow: "inset 0 0 0 1px #1a2a1a, inset 0 2px 10px rgba(0,0,0,0.8)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase leading-none"
              style={{ background: color, color: "#0a0a0a" }}
            >
              DECK {side}
            </span>
            {typeof trackNo === "number" && typeof trackCount === "number" && trackCount > 0 && (
              <span className="font-mono text-[10px] text-neutral-500">
                TITRE {trackNo}/{trackCount}
              </span>
            )}
            {deck.key && (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none"
                style={{ color, boxShadow: `inset 0 0 0 1px ${color}44` }}
                title={`Tonalité détectée : ${deck.key.name} (Camelot ${deck.key.camelot})`}
              >
                {deck.key.camelot}
              </span>
            )}
            {deck.bpm > 0 && (
              <span
                className="ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-bold leading-none"
                style={{ color, boxShadow: `inset 0 0 0 1px ${color}44` }}
              >
                {Math.round(deck.bpm)} BPM
              </span>
            )}
          </div>

          <div
            className="truncate font-mono text-base font-bold leading-tight"
            style={{ color, textShadow: `0 0 8px ${color}, 0 0 2px ${color}` }}
            title={deck.name || undefined}
          >
            {playing ? "▶ " : loaded ? "❚❚ " : ""}
            {deck.name || "— AUCUN DISQUE —"}
          </div>

          {/* progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/70" style={{ boxShadow: "inset 0 0 0 1px #1a2a1a" }}>
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-linear"
              style={{ width: `${pct}%`, background: color, boxShadow: `0 0 6px ${color}` }}
            />
          </div>

          <div className="flex items-center justify-between font-mono text-[11px]">
            <span style={{ color, textShadow: `0 0 4px ${color}` }}>{fmt(pos)}</span>
            <span className="text-neutral-600">-{fmt(remain)}</span>
          </div>

          <div className="flex items-center gap-1.5 truncate font-mono text-[10px] text-neutral-500">
            <span className="font-bold" style={{ color: nextName ? "#facc15" : "#4a4a4a" }}>⏭ SUIVANT</span>
            <span className="truncate">{nextName || "—"}</span>
          </div>
        </div>
      </div>

      {/* transport row */}
      <div className="flex items-center justify-center gap-3">
        <button onClick={onPrev} className="hw-transport h-11 w-11 text-sm" style={{ ["--led" as string]: color }} title="Titre précédent">
          ⏮
        </button>
        <button
          onClick={onPlayPause}
          className={`hw-transport h-14 w-14 text-xl ${playing ? "hw-transport-play" : ""}`}
          style={{ ["--led" as string]: color }}
          title={playing ? "Pause" : "Lecture"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={onNext} className="hw-transport h-11 w-11 text-sm" style={{ ["--led" as string]: color }} title="Titre suivant">
          ⏭
        </button>
      </div>
    </div>
  );
}
