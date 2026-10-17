import { useEffect, useState } from "react";
import type { SampleKeys } from "@/lib/atelier/players";
import { midiName } from "@/lib/audio/theory";
import { Knob } from "../Knob";

const KEYMAP = "awsedftgyhujkolp";
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
const BLACK_KEYS = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22];

export function MiniKeys({ keys, color, active }: { keys: SampleKeys; color: string; active: boolean }) {
  const [base, setBase] = useState(48);
  const [held, setHeld] = useState(new Set<number>());
  const [volume, setVolume] = useState(0.9);
  const [, setForceRender] = useState(0);

  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLElement && e.target.isContentEditable) return;

      const index = KEYMAP.indexOf(e.key.toLowerCase());
      if (index === -1) return;

      const midi = base + index;
      keys.noteOn(midi);
      setHeld(prev => new Set(prev).add(midi));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const index = KEYMAP.indexOf(e.key.toLowerCase());
      if (index === -1) return;

      const midi = base + index;
      keys.noteOff(midi);
      setHeld(prev => {
        const newSet = new Set(prev);
        newSet.delete(midi);
        return newSet;
      });
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      keys.allOff();
    };
  }, [active, base, keys]);

  const handlePointerDown = (midi: number) => (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    keys.noteOn(midi);
    setHeld(prev => new Set(prev).add(midi));
  };

  const handlePointerUp = (midi: number) => () => {
    keys.noteOff(midi);
    setHeld(prev => {
      const newSet = new Set(prev);
      newSet.delete(midi);
      return newSet;
    });
  };

  const handlePointerCancel = (midi: number) => () => {
    keys.noteOff(midi);
    setHeld(prev => {
      const newSet = new Set(prev);
      newSet.delete(midi);
      return newSet;
    });
  };

  const handlePointerLost = (midi: number) => () => {
    keys.noteOff(midi);
    setHeld(prev => {
      const newSet = new Set(prev);
      newSet.delete(midi);
      return newSet;
    });
  };

  const handleOctaveChange = (delta: number) => {
    setBase(prev => Math.max(24, Math.min(84, prev + delta)));
  };

  const handleRootChange = (delta: number) => {
    keys.configure({ root: Math.max(24, Math.min(96, keys.root + delta)) });
    setForceRender(n => n + 1);
  };

  const handleAttackChange = (value: number) => {
    keys.configure({ attack: value });
    setForceRender(n => n + 1);
  };

  const handleReleaseChange = (value: number) => {
    keys.configure({ release: value });
    setForceRender(n => n + 1);
  };

  const handleVolumeChange = (value: number) => {
    setVolume(value);
    keys.setVolume(value);
  };

  const handleLoopToggle = () => {
    keys.configure({ loop: !keys.loop });
    setForceRender(n => n + 1);
  };

  const handleReverseToggle = () => {
    keys.configure({ reverse: !keys.reverse });
    setForceRender(n => n + 1);
  };

  return (
    <div className="hw-panel flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">MINI CLAVIER</span>
          {keys.loaded ? (
            <span className="text-[11px] font-bold" style={{ color }}>{keys.name}</span>
          ) : (
            <span className="text-[11px] text-neutral-500">Aucun son chargé : touche CLAVIER sur un sample, un stem ou un son de la banque</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => handleOctaveChange(-12)}
          >
            OCT −
          </button>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => handleOctaveChange(12)}
          >
            OCT +
          </button>
          <span className="text-[11px] font-bold">NOTE DE BASE</span>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => handleRootChange(-1)}
          >
            ◄
          </button>
          <span className="text-[11px] font-bold">{midiName(keys.root)}</span>
          <button
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            onClick={() => handleRootChange(1)}
          >
            ►
          </button>
          <Knob
            label="Attaque"
            value={keys.attack}
            min={0}
            max={1}
            defaultValue={0.005}
            onChange={handleAttackChange}
            color={color}
            size={36}
            led
            format={(v) => `${Math.round(v * 1000)} ms`}
          />
          <Knob
            label="Relâche"
            value={keys.release}
            min={0}
            max={3}
            defaultValue={0.25}
            onChange={handleReleaseChange}
            color={color}
            size={36}
            led
            format={(v) => `${v.toFixed(2)} s`}
          />
          <Knob
            label="Volume"
            value={volume}
            min={0}
            max={1.5}
            defaultValue={0.9}
            onChange={handleVolumeChange}
            color={color}
            size={36}
            led
          />
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${keys.loop ? "hw-btn-on" : ""}`}
            onClick={handleLoopToggle}
            style={{ ["--led" as string]: keys.loop ? color : undefined }}
          >
            BOUCLE
          </button>
          <button
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${keys.reverse ? "hw-btn-on" : ""}`}
            onClick={handleReverseToggle}
            style={{ ["--led" as string]: keys.reverse ? color : undefined }}
          >
            INVERSÉ
          </button>
        </div>
      </div>
      <div className="relative h-28 w-full select-none touch-none">
        {WHITE_KEYS.map((offset, i) => {
          const midi = base + offset;
          const isHeld = held.has(midi);
          const isRoot = midi === keys.root;
          const keyLetter = offset < KEYMAP.length ? KEYMAP[offset] : undefined;

          return (
            <div
              key={`white-${midi}`}
              className="absolute top-0 h-full rounded-b-md border border-neutral-300 bg-white"
              style={{
                left: `${i * (100 / 14)}%`,
                width: `${100 / 14}%`,
                backgroundColor: isHeld ? color : undefined,
                borderColor: isHeld ? color : undefined
              }}
              onPointerDown={handlePointerDown(midi)}
              onPointerUp={handlePointerUp(midi)}
              onPointerCancel={handlePointerCancel(midi)}
              onLostPointerCapture={handlePointerLost(midi)}
            >
              {isRoot && (
                <div
                  className="absolute top-1 left-1/2 h-1 w-1 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
              {keyLetter && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-neutral-700">
                  {keyLetter}
                </div>
              )}
              {offset % 12 === 0 && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-bold text-neutral-700">
                  {midiName(midi)}
                </div>
              )}
            </div>
          );
        })}
        {BLACK_KEYS.map((offset) => {
          const midi = base + offset;
          const isHeld = held.has(midi);
          const isRoot = midi === keys.root;
          const wIdx = WHITE_KEYS.filter(w => w < offset).length;

          return (
            <div
              key={`black-${midi}`}
              className="absolute top-0 z-10 h-[62%] rounded-b border border-neutral-800 bg-black"
              style={{
                left: `${wIdx * (100 / 14) - ((100 / 14) * 0.6) / 2}%`,
                width: `${(100 / 14) * 0.6}%`,
                backgroundColor: isHeld ? color : undefined,
                borderColor: isHeld ? color : undefined
              }}
              onPointerDown={handlePointerDown(midi)}
              onPointerUp={handlePointerUp(midi)}
              onPointerCancel={handlePointerCancel(midi)}
              onLostPointerCapture={handlePointerLost(midi)}
            >
              {isRoot && (
                <div
                  className="absolute top-1 left-1/2 h-1 w-1 rounded-full"
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
