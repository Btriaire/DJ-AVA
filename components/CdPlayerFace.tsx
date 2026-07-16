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

// A 90s-style front-facing CD player: spinning disc window, dot-matrix LCD
// with track/time/BPM, and the classic ⏮ ▶/⏸ ⏭ transport underneath — gives
// an at-a-glance "what's playing / what's next" readout for the active set.
export function CdPlayerFace({ deck, color, side, trackNo, trackCount, nextName, onPrev, onPlayPause, onNext }: Props) {
  const dur = deck.duration || 0;
  const pos = Math.min(dur, deck.position ? deck.position() : 0);
  const pct = dur > 0 ? (pos / dur) * 100 : 0;
  const playing = deck.playing;

  return (
    <div
      className="flex items-stretch gap-3 rounded-lg p-2.5"
      style={{
        background: "linear-gradient(180deg, #1c1c1c 0%, #0e0e0e 60%, #050505 100%)",
        border: "1px solid #000",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), inset 0 0 20px rgba(0,0,0,0.6), 0 3px 8px rgba(0,0,0,0.5)",
      }}
    >
      {/* spinning disc window */}
      <div
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 50%, #2a2a2e 0%, #131315 55%, #050505 100%)",
          border: "1px solid #000",
          boxShadow: "inset 0 0 8px rgba(0,0,0,0.9), 0 0 0 2px #0a0a0a",
        }}
      >
        <div
          className="absolute inset-1 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${color}22 0deg, transparent 40deg, ${color}33 90deg, transparent 140deg, ${color}22 200deg, transparent 260deg, ${color}33 320deg, ${color}22 360deg)`,
            animation: playing ? "cdspin 2.2s linear infinite" : "none",
          }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "#050505", boxShadow: `0 0 6px ${color}88, inset 0 0 2px #000` }}
        />
        <style>{`@keyframes cdspin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* LCD readout */}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded px-1 py-0.5 text-[8px] font-black uppercase leading-none"
            style={{ background: color, color: "#0a0a0a" }}
          >
            {side}
          </span>
          {typeof trackNo === "number" && typeof trackCount === "number" && trackCount > 0 && (
            <span className="font-mono text-[9px] text-neutral-500">
              TITRE {trackNo}/{trackCount}
            </span>
          )}
          {deck.bpm > 0 && (
            <span className="ml-auto font-mono text-[9px] font-bold" style={{ color }}>
              {Math.round(deck.bpm)} BPM
            </span>
          )}
        </div>
        <div
          className="truncate rounded px-1.5 py-0.5 font-mono text-[11px] font-bold"
          style={{ background: "#0a0d0a", color, textShadow: `0 0 5px ${color}` }}
          title={deck.name || undefined}
        >
          {playing ? "▶ " : deck.name ? "❚❚ " : ""}
          {deck.name || "— AUCUN SINGLE —"}
        </div>
        {/* progress bar */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/60">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}` }} />
        </div>
        <div className="flex items-center justify-between font-mono text-[9px] text-neutral-500">
          <span>{fmt(pos)}</span>
          {nextName && <span className="truncate px-2 text-neutral-600">⏭ {nextName}</span>}
          <span>{fmt(dur)}</span>
        </div>
      </div>

      {/* transport */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={onPrev} className="hw-transport h-8 w-8 text-xs" style={{ ["--led" as string]: color }} title="Titre précédent">
          ⏮
        </button>
        <button
          onClick={onPlayPause}
          className={`hw-transport h-10 w-10 text-base ${playing ? "hw-transport-play" : ""}`}
          style={{ ["--led" as string]: color }}
          title={playing ? "Pause" : "Lecture"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button onClick={onNext} className="hw-transport h-8 w-8 text-xs" style={{ ["--led" as string]: color }} title="Titre suivant">
          ⏭
        </button>
      </div>
    </div>
  );
}
