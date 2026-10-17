"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Deck } from "../lib/audio/Deck";
import { Knob } from "./Knob";

const HUES = ["#f472b6", "#fb923c", "#38bdf8", "#a3e635", "#a78bfa", "#facc15"];
const LENGTHS = [1/8, 1/4, 1/2, 1, 2, 4, 8, 16];
const LABELS = ["1/8","1/4","1/2","1","2","4","8","16"];
const ROLL_OPTS = [null, 1, 2, 4, 8];



export function StemLoopPanel({ deck, labels, initial, color, rerender, onExport, onClose }: { deck: Deck; labels: string[]; initial: number; color: string; rerender: () => void; onExport: (i: number) => void; onClose: () => void }) {
  const [quant, setQuant] = useState(true);
  const [status, setStatus] = useState<(null | { phase: number; wraps: number })[]>([]);

  useEffect(() => {
    const t0 = setTimeout(() => {
      try {
        const savedQuant = localStorage.getItem("djsynth.stemloop.quant");
        if (savedQuant !== null) setQuant(savedQuant === "true");
      } catch {}
    }, 0);
    return () => clearTimeout(t0);
  }, []);

  useEffect(() => {
    let rafId: number;
    let lastUpdate = 0;
    const updateStatus = () => {
      const now = performance.now();
      if (now - lastUpdate < 33) {
        rafId = requestAnimationFrame(updateStatus);
        return;
      }
      lastUpdate = now;
      setStatus(Array.from({ length: labels.length }, (_, i) => {
        const s = deck.stemLoopStatus(i);
        return s ? { phase: s.phase, wraps: s.wraps } : null;
      }));
      rafId = requestAnimationFrame(updateStatus);
    };
    rafId = requestAnimationFrame(updateStatus);
    return () => cancelAnimationFrame(rafId);
  }, [deck, labels.length]);

  const startForLoop = (): number | undefined => {
    if (!deck.bpm) return undefined;
    const spb = 60 / deck.bpm;
    const raw = deck.position();
    return quant ? Math.max(0, Math.round((raw - deck.beatGridOffset) / spb) * spb + deck.beatGridOffset) : raw;
  };

  const toggleLength = (i: number, b: number) => {
    if (deck.stemLoopBeatsVal[i] === b) {
      deck.clearStemLoop(i);
    } else {
      deck.setStemBeatLoop(i, b, { quantize: quant, start: startForLoop() });
    }
    rerender();
  };

  const handleQuantChange = () => {
    const newQuant = !quant;
    setQuant(newQuant);
    try { localStorage.setItem("djsynth.stemloop.quant", newQuant.toString()); } catch {}
  };

  const canLoop = deck.stemsActive && deck.stemReady && deck.bpm;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="hw-panel fixed bottom-3 left-1/2 z-[100] flex max-h-[90vh] w-[min(640px,calc(100vw-1rem))] -translate-x-1/2 flex-col gap-2.5 overflow-y-auto p-3"
      style={{ borderColor: `${color}66`, boxShadow: `0 14px 34px rgba(0,0,0,0.8), 0 0 22px ${color}33, inset 0 1px 0 rgba(255,255,255,0.07)` }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-black uppercase tracking-[0.2em]" style={{ color, textShadow: `0 0 8px ${color}88` }}>BOUCLES DE STEMS</span>
        <button className="hw-btn px-2 py-1 text-[11px]" title="Fermer" onClick={onClose}>✕</button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${quant ? "hw-btn-on" : ""}`} title="Cale le début de la boucle sur le temps le plus proche" onClick={handleQuantChange}>QUANT</button>
        <Knob
          label="Doux"
          value={deck.stemLoopSmoothMs[initial] ?? 10}
          min={0}
          max={60}
          defaultValue={10}
          onChange={(v) => {
            labels.forEach((_, i) => deck.setStemLoopSmooth(i, Math.round(v)));
            rerender();
          }}
          color={color}
          size={40}
          led
          format={(v) => `${Math.round(v)} ms`}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">FIN</span>
        {ROLL_OPTS.map((opt, i) => (
          <button key={i} className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold min-w-[34px] ${deck.stemLoopRollAt[initial] === opt ? "hw-btn-on" : ""}`} onClick={() => {
            labels.forEach((_, i) => deck.setStemLoopRoll(i, opt));
            rerender();
          }}>
            {opt === null ? "∞" : opt.toString()}
          </button>
        ))}
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold ml-auto" disabled={!deck.stemLoopActive.some(Boolean)} title="Coupe toutes les boucles de stems, chaque stem reprend en place" onClick={() => {
          deck.clearAllStemLoops();
          rerender();
        }}>TOUT OFF</button>
      </div>

      <div className="flex flex-col gap-1.5">
        {labels.map((label, i) => {
          const hue = HUES[i % HUES.length];
          const s = status[i];
          const loopBeats = deck.stemLoopBeatsVal[i];
          const rollAt = deck.stemLoopRollAt[i];
          const isLooping = !!deck.stemLoopActive[i];

          return (
            <div key={i} className={`flex flex-col gap-1 rounded-md p-1 ${i === initial ? "ring-1 ring-white/20" : ""}`}>
              <div className="flex flex-wrap items-center gap-1">
                <span className="w-14 truncate text-[10px] font-black" style={{ color: hue, backgroundColor: isLooping ? `${hue}11` : undefined }}>{label}</span>
                {LENGTHS.map((b, j) => (
                  <button
                    key={j}
                    className={`hw-btn min-w-[30px] px-1.5 py-1 text-[10px] font-bold ${loopBeats === b ? "hw-btn-on" : ""}`}
                    style={{ ["--led" as string]: hue }}
                    disabled={!canLoop}
                    onClick={() => toggleLength(i, b)}
                  >
                    {LABELS[j]}
                  </button>
                ))}
                <button className="hw-btn min-w-[24px] px-1.5 py-1 text-[10px] font-bold" disabled={!isLooping} onClick={() => {
                  deck.shiftStemLoop(i, -1 * (loopBeats ?? 1));
                  rerender();
                }}>◄</button>
                <button className="hw-btn min-w-[24px] px-1.5 py-1 text-[10px] font-bold" disabled={!isLooping} onClick={() => {
                  deck.shiftStemLoop(i, loopBeats ?? 1);
                  rerender();
                }}>►</button>
                <button className="hw-btn min-w-[24px] px-1.5 py-1 text-[10px] font-bold" disabled={!isLooping} onClick={() => {
                  deck.resizeStemLoop(i, 0.5);
                  rerender();
                }}>½</button>
                <button className="hw-btn min-w-[24px] px-1.5 py-1 text-[10px] font-bold" disabled={!isLooping} onClick={() => {
                  deck.resizeStemLoop(i, 2);
                  rerender();
                }}>×2</button>
                <button className="hw-btn px-1.5 py-1 text-[10px] font-bold" disabled={!isLooping} onClick={() => {
                  deck.clearStemLoop(i);
                  rerender();
                }}>OFF</button>
                <button className="hw-btn px-1.5 py-1 text-[10px] font-bold" title="Télécharger la boucle de ce stem en WAV" disabled={!isLooping} onClick={() => onExport(i)}>⤓</button>
                <span className="font-mono text-[10px] w-10 text-right">
                  {isLooping ? `${s?.wraps ?? 0}${rollAt ? "/" + rollAt : ""}` : ""}
                </span>
              </div>
              {isLooping && (
                <div className="h-1 w-full overflow-hidden rounded bg-white/5">
                  <div className="h-full" style={{ width: `${(s?.phase ?? 0) * 100}%`, backgroundColor: hue }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!canLoop && <span className="text-[11px] text-neutral-400">Active les stems et attends le BPM pour boucler</span>}
      <div className="text-[10px] text-neutral-500">Chaque stem boucle seul ; à l&apos;arrêt de sa boucle, il reprend en place avec les autres.</div>
    </div>,
    document.body
  );
}
