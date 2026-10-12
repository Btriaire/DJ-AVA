"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Deck } from "../lib/audio/Deck";
import { Knob } from "./Knob";
import { PerfPad } from "./PerfPad";

const HUES = ["#f472b6", "#fb923c", "#38bdf8", "#a3e635", "#a78bfa", "#facc15"];
const LENGTHS = [1/16, 1/8, 1/4, 1/2, 1, 2, 4, 8, 16, 32];
const LABELS = ["1/16","1/8","1/4","1/2","1","2","4","8","16","32"];
const ROLL_OPTS = [null, 1, 2, 4, 8];

function fmtBeats(b: number): string {
  const idx = LENGTHS.indexOf(b);
  return idx !== -1 ? LABELS[idx] : String(Number(b.toFixed(2)));
}

export function StemLoopPanel({ deck, labels, initial, color, rerender, onExport, onClose }: { deck: Deck; labels: string[]; initial: number; color: string; rerender: () => void; onExport: (i: number) => void; onClose: () => void }) {
  const [sel, setSel] = useState<boolean[]>(labels.map((_, i) => i === initial));
  const [mode, setMode] = useState<"lock" | "hold">("lock");
  const [quant, setQuant] = useState(true);
  const [status, setStatus] = useState<(null | { phase: number; wraps: number })[]>([]);
  const latest = useRef({ targets: [] as number[], mode: "lock" as "lock" | "hold" });

  useEffect(() => {
    const t0 = setTimeout(() => {
      try {
        const savedMode = localStorage.getItem("djsynth.stemloop.mode") as "lock" | "hold" | null;
        if (savedMode) setMode(savedMode);
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

  useEffect(() => {
    latest.current = { targets: sel.flatMap((s, i) => s ? [i] : []), mode };
  }, [sel, mode]);

  useEffect(() => {
    return () => {
      if (latest.current.mode === "hold") {
        latest.current.targets.forEach(i => deck.clearStemLoop(i));
        rerender();
      }
    };
  }, [deck, rerender]);

  const targets = sel.flatMap((s, i) => s ? [i] : []);
  const firstTarget = targets[0];
  const firstLoop = firstTarget !== undefined ? deck.stemLoopBeatsVal[firstTarget] : null;
  const firstRoll = firstTarget !== undefined ? deck.stemLoopRollAt[firstTarget] : null;
  const firstSmooth = firstTarget !== undefined ? deck.stemLoopSmoothMs[firstTarget] : 10;

  const startForLoop = (): number | undefined => {
    if (!deck.bpm) return undefined;
    const spb = 60 / deck.bpm;
    const raw = deck.position();
    return quant ? Math.max(0, Math.round((raw - deck.beatGridOffset) / spb) * spb + deck.beatGridOffset) : raw;
  };

  const handleLengthDown = () => {
    if (!targets.length) return;
    const b = firstLoop ?? 1;
    if (mode === "lock") {
      const allSame = targets.every(i => deck.stemLoopBeatsVal[i] === b);
      if (allSame) {
        targets.forEach(i => deck.clearStemLoop(i));
      } else {
        const start = startForLoop();
        targets.forEach(i => deck.setStemBeatLoop(i, b, { quantize: quant, start }));
      }
    } else {
      const start = startForLoop();
      targets.forEach(i => deck.setStemBeatLoop(i, b, { quantize: quant, start }));
    }
    rerender();
  };

  const handleLengthUp = () => {
    if (mode === "hold") {
      targets.forEach(i => deck.clearStemLoop(i));
      rerender();
    }
  };

  const handleModeChange = (newMode: "lock" | "hold") => {
    setMode(newMode);
    try { localStorage.setItem("djsynth.stemloop.mode", newMode); } catch {}
  };

  const handleQuantChange = () => {
    const newQuant = !quant;
    setQuant(newQuant);
    try { localStorage.setItem("djsynth.stemloop.quant", newQuant.toString()); } catch {}
  };

  const handleResize = (factor: 0.5 | 2) => {
    targets.forEach(i => deck.resizeStemLoop(i, factor));
    rerender();
  };

  const handleShift = (dir: -1 | 1) => {
    targets.forEach(i => {
      const n = deck.stemLoopBeatsVal[i] ?? 1;
      deck.shiftStemLoop(i, dir * n);
    });
    rerender();
  };

  const handleClear = () => {
    targets.forEach(i => deck.clearStemLoop(i));
    rerender();
  };

  const handleSmooth = (v: number) => {
    targets.forEach(i => deck.setStemLoopSmooth(i, Math.round(v)));
    rerender();
  };

  const handleRoll = (repeats: number | null) => {
    targets.forEach(i => deck.setStemLoopRoll(i, repeats));
    rerender();
  };

  const handleTargetToggle = (i: number) => {
    setSel(prev => {
      const newSel = [...prev];
      newSel[i] = !newSel[i];
      return newSel;
    });
  };

  const handleAll = () => setSel(labels.map(() => true));
  const handleNone = () => setSel(labels.map(() => false));

  const canLoop = deck.stemsActive && deck.stemReady && deck.playing && deck.bpm;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="hw-panel fixed bottom-3 left-1/2 z-[100] flex max-h-[90vh] w-[min(560px,calc(100vw-1rem))] -translate-x-1/2 flex-col gap-2.5 overflow-y-auto p-3"
      style={{ borderColor: `${color}66`, boxShadow: `0 14px 34px rgba(0,0,0,0.8), 0 0 22px ${color}33, inset 0 1px 0 rgba(255,255,255,0.07)` }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-black uppercase tracking-[0.2em]" style={{ color, textShadow: `0 0 8px ${color}88` }}>BOUCLES DE STEMS</span>
        <button className="hw-btn px-2 py-1 text-[11px]" title="Fermer" onClick={onClose}>✕</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">APPLIQUER À</span>
        {labels.map((label, i) => (
          <button key={i} className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${sel[i] ? "hw-btn-on" : ""}`} style={{ ["--led" as string]: HUES[i % HUES.length] }} onClick={() => handleTargetToggle(i)}>
            {label}
          </button>
        ))}
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold" onClick={handleAll}>TOUS</button>
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold" onClick={handleNone}>AUCUN</button>
      </div>

      <div className="grid grid-cols-5 gap-1.5">
        {LENGTHS.map((b, i) => (
          <PerfPad
            key={i}
            label={LABELS[i]}
            sub="temps"
            color={color}
            active={targets.length > 0 && targets.every(j => deck.stemLoopBeatsVal[j] === b)}
            lit={targets.some(j => deck.stemLoopBeatsVal[j] === b)}
            height={46}
            disabled={!canLoop}
            onDown={handleLengthDown}
            onUp={handleLengthUp}
          />
        ))}
      </div>
      {!canLoop && <span className="text-[11px] text-neutral-400">Lance la lecture avec les stems actifs pour boucler</span>}

      <div className="flex flex-wrap items-center gap-1.5">
        <button className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${mode === "lock" ? "hw-btn-on" : ""}`} title="Un appui engage la boucle, un second appui la relâche" onClick={() => handleModeChange("lock")}>VERROU</button>
        <button className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${mode === "hold" ? "hw-btn-on" : ""}`} title="La boucle dure tant que tu maintiens le pad" onClick={() => handleModeChange("hold")}>MAINT.</button>
        <button className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold ${quant ? "hw-btn-on" : ""}`} title="Cale le début de la boucle sur le temps le plus proche" onClick={handleQuantChange}>QUANT</button>
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold min-w-[34px]" onClick={() => handleResize(0.5)}>½</button>
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold min-w-[34px]" onClick={() => handleResize(2)}>×2</button>
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold min-w-[34px]" title="Décale la boucle d'une longueur" onClick={() => handleShift(-1)}>◄</button>
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold min-w-[34px]" title="Décale la boucle d'une longueur" onClick={() => handleShift(1)}>►</button>
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold" onClick={handleClear}>OFF</button>
        <Knob
          label="Doux"
          value={firstSmooth}
          min={0}
          max={60}
          defaultValue={10}
          onChange={handleSmooth}
          color={color}
          size={40}
          led
          format={(v) => `${Math.round(v)} ms`}
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">FIN</span>
        {ROLL_OPTS.map((opt, i) => (
          <button key={i} className={`hw-btn px-2.5 py-1.5 text-[11px] font-bold min-w-[34px] ${firstRoll === opt ? "hw-btn-on" : ""}`} onClick={() => handleRoll(opt)}>
            {opt === null ? "∞" : opt.toString()}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {labels.map((label, i) => {
          const hue = HUES[i % HUES.length];
          const s = status[i];
          const loopBeats = deck.stemLoopBeatsVal[i];
          const rollAt = deck.stemLoopRollAt[i];
          const isSelected = sel[i];
          const isLooping = !!s;

          return (
            <div key={i} className="flex items-center gap-1.5">
              <button className={`hw-btn w-20 truncate px-2 py-1 text-[10px] ${sel[i] ? "hw-btn-on" : ""}`} style={{ ["--led" as string]: hue }} onClick={() => handleTargetToggle(i)}>
                {label}
              </button>
              <div className="relative h-8 flex-1 overflow-hidden rounded ring-1 ring-white/5" style={{ backgroundColor: isSelected ? "#161a21" : "#0a0d12", borderColor: isLooping ? hue : undefined }}>
                {isLooping && (
                  <>
                    <div style={{ background: `linear-gradient(90deg, ${hue}55, ${hue}1f)` }} className="absolute inset-0" />
                    {Array.from({ length: Math.ceil(loopBeats ?? 1) }).map((_, j) => (
                      <div key={j} className="absolute top-0 h-full w-px bg-white/15" style={{ left: `${(j / (loopBeats ?? 1)) * 100}%` }} />
                    ))}
                    {(loopBeats ?? 1) < 1 && Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="absolute top-0 h-full w-px bg-white/10" style={{ left: `${(j / 4) * 100}%` }} />
                    ))}
                    <div className="absolute inset-y-0 w-0.5 bg-white" style={{ left: `${(s.phase ?? 0) * 100}%`, boxShadow: `0 0 4px 1px white` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">
                      ⟳ {fmtBeats(loopBeats ?? 1)}
                    </span>
                  </>
                )}
                {!isLooping && (
                  <>
                    <div style={{ background: `linear-gradient(90deg, ${hue}14, ${hue}08)` }} className="absolute inset-0" />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-400">libre</span>
                  </>
                )}
              </div>
              <span className="w-12 text-right text-[10px] font-mono">
                {isLooping ? `${s.wraps ?? 0}${rollAt ? "/" + rollAt : ""}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button className="hw-btn px-2.5 py-1.5 text-[11px] font-bold" disabled={firstLoop === null} title="Télécharger la boucle de ce stem au format WAV" onClick={() => firstTarget !== undefined && onExport(firstTarget)}>EXPORT WAV</button>
      </div>
    </div>,
    document.body
  );
}
