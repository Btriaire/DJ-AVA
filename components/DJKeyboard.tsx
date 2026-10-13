import { useEffect, useRef, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { PAD_SLICES, ECHO_DIVS, type PadSettings } from "@/lib/audio/SamplePad";

type Props = {
  engine: DJEngine;
};

export const DJKeyboard = ({ engine }: Props) => {
  const [settings, setSettings] = useState<PadSettings>(engine.keyPad.settings);
  const [activeMask, setActiveMask] = useState(0);
  const [lastEffect, setLastEffect] = useState("");
  const [keySource, setKeySource] = useState(engine.getKeySource());
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const shiftPressed = useRef(false);

  const padKeys = [
    "A", "S", "D", "F", "G", "H", "J", "K",
    "Z", "X", "C", "V", "B", "N", "M", ","
  ];

  const setSetting = (key: keyof PadSettings, value: number | boolean) => {
    engine.keyPad.set(key, value);
    setSettings({ ...settings, [key]: value });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        (e.target as HTMLElement).isContentEditable) return;

    if (e.repeat && (padKeys.includes(e.code) || /Digit[0-9]/.test(e.code))) return;

    const isOurs = padKeys.includes(e.code) || /^Digit[0-9]$/.test(e.code) || e.code.startsWith("Arrow") || e.code === "ShiftLeft" || e.code === "ShiftRight";
    if (!isOurs) return;
    e.preventDefault();

    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      shiftPressed.current = true;
      return;
    }

    const sliceIndex = padKeys.indexOf(e.code);
    if (sliceIndex !== -1) {
      const wasReversed = settings.reverse;
      if (shiftPressed.current) setSetting("reverse", true);
      engine.keyPad.trigger(sliceIndex);
      if (shiftPressed.current) setSetting("reverse", wasReversed);
      return;
    }

    switch (e.code) {
      case "Digit1": setSetting("reverse", !settings.reverse); break;
      case "Digit2": setSetting("hold", !settings.hold); break;
      case "Digit3": setSetting("echo", settings.echo ? 0 : 0.5); break;
      case "Digit4": setSetting("filter", settings.filter === 1 ? 0.25 : 1); break;
      case "Digit5": setSetting("gate", !settings.gate); break;
      case "Digit6": engine.keyPad.dropHQ(); setLastEffect("DROP HQ"); break;
      case "Digit7": engine.keyPad.impact(); setLastEffect("IMPACT"); break;
      case "Digit8": engine.keyPad.brake(1); setLastEffect("FREIN 1 TEMPS"); break;
      case "Digit9": engine.keyPad.scratch(); setLastEffect("SCRATCH"); break;
      case "Digit0": engine.keyPad.stopAll(); setLastEffect("TOUT ARRÊTER"); break;
      case "ArrowUp": setSetting("pitch", Math.min(settings.pitch + 1, 12)); break;
      case "ArrowDown": setSetting("pitch", Math.max(settings.pitch - 1, -12)); break;
      case "ArrowLeft": setSetting("echoDiv", Math.max(settings.echoDiv - 1, 0)); break;
      case "ArrowRight": setSetting("echoDiv", Math.min(settings.echoDiv + 1, ECHO_DIVS.length - 1)); break;
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
      shiftPressed.current = false;
      return;
    }

    const sliceIndex = padKeys.indexOf(e.code);
    if (sliceIndex !== -1) {
      engine.keyPad.release(sliceIndex);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [settings]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      let mask = 0;
      for (let i = 0; i < PAD_SLICES; i++) {
        if (engine.keyPad.isActive(i)) mask |= 1 << i;
      }
      setActiveMask(mask);
    }, 50);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handlePadDown = (slice: number) => {
    const wasReversed = settings.reverse;
    if (shiftPressed.current) setSetting("reverse", true);
    engine.keyPad.trigger(slice);
    if (shiftPressed.current) setSetting("reverse", wasReversed);
  };

  const handlePadUp = (slice: number) => {
    engine.keyPad.release(slice);
  };

  const renderPad = (slice: number) => {
    const isActive = (activeMask & (1 << slice)) !== 0;
    const isFirstRow = slice < 8;
    const bgColor = isFirstRow ? "#38bdf8" : "#e879f9";
    const key = padKeys[slice];

    return (
      <div
        key={slice}
        className={`flex flex-col items-center justify-center p-2 rounded-lg cursor-pointer transition-all ${
          isActive ? "ring-2 ring-white/50 shadow-lg" : ""
        }`}
        style={{ backgroundColor: bgColor }}
        onPointerDown={() => handlePadDown(slice)}
        onPointerUp={() => handlePadUp(slice)}
        onPointerLeave={() => handlePadUp(slice)}
      >
        <div className="text-3xl font-bold">{key}</div>
        <div className="text-xs opacity-70">{slice + 1}</div>
      </div>
    );
  };

  return (
    <div className="hw-panel p-4 space-y-4">
      <div className="hw-recess p-2 rounded-lg">
        <div className="grid grid-cols-8 gap-2">
          {Array.from({ length: PAD_SLICES }, (_, i) => renderPad(i))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="hw-recess p-2 rounded-lg">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            PITCH
          </div>
          <div className="font-mono bg-[#0a0d0a] text-white p-1 rounded text-center">
            {settings.pitch === 0 ? "0 st" : `${settings.pitch > 0 ? "+" : ""}${settings.pitch} st`}
          </div>
          <div className="flex gap-1 mt-1">
            <button
              className="hw-btn flex-1"
              onClick={() => setSetting("pitch", Math.max(settings.pitch - 1, -12))}
            >
              −
            </button>
            <button
              className="hw-btn flex-1"
              onClick={() => setSetting("pitch", 0)}
            >
              0
            </button>
            <button
              className="hw-btn flex-1"
              onClick={() => setSetting("pitch", Math.min(settings.pitch + 1, 12))}
            >
              +
            </button>
          </div>
        </div>

        <div className="hw-recess p-2 rounded-lg">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
            FILTRE
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.filter * 100}
            onChange={(e) => setSetting("filter", parseInt(e.target.value) / 100)}
            className="w-full"
          />
        </div>
      </div>

      <div className="hw-recess p-2 rounded-lg">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
          ÉCHO
        </div>
        <input
          type="range"
          min="0"
          max="100"
          value={settings.echo * 100}
          onChange={(e) => setSetting("echo", parseInt(e.target.value) / 100)}
          className="w-full"
        />
        <div className="flex gap-1 mt-1">
          {ECHO_DIVS.map((div, i) => (
            <button
              key={i}
              className={`hw-btn flex-1 ${settings.echoDiv === i ? "hw-btn-on" : ""}`}
              onClick={() => setSetting("echoDiv", i)}
            >
              {div}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className={`hw-btn flex-1 ${settings.reverse ? "hw-btn-on" : ""}`}
          onClick={() => setSetting("reverse", !settings.reverse)}
        >
          INVERSÉ
        </button>
        <button
          className={`hw-btn flex-1 ${settings.hold ? "hw-btn-on" : ""}`}
          onClick={() => setSetting("hold", !settings.hold)}
        >
          MAINTIEN
        </button>
        <button
          className={`hw-btn flex-1 ${settings.gate ? "hw-btn-on" : ""}`}
          onClick={() => setSetting("gate", !settings.gate)}
        >
          RÉPÈTITION
        </button>
      </div>

      <div className="flex gap-2">
        <button
          className="hw-btn flex-1"
          onClick={() => { engine.setKeySource("A"); setKeySource("A"); }}
        >
          PLATINE A
        </button>
        <button
          className="hw-btn flex-1"
          onClick={() => { engine.setKeySource("B"); setKeySource("B"); }}
        >
          PLATINE B
        </button>
      </div>

      <div className="flex gap-2">
        <button
          className="hw-btn flex-1 bg-[#f43f5e] text-white"
          onClick={() => { engine.keyPad.dropHQ(); setLastEffect("DROP HQ"); }}
        >
          DROP HQ
        </button>
        <button
          className="hw-btn flex-1"
          onClick={() => { engine.keyPad.impact(); setLastEffect("IMPACT"); }}
        >
          IMPACT
        </button>
        <button
          className="hw-btn flex-1"
          onClick={() => { engine.keyPad.brake(1); setLastEffect("FREIN 1 TEMPS"); }}
        >
          FREIN 1 TEMPS
        </button>
        <button
          className="hw-btn flex-1"
          onClick={() => { engine.keyPad.scratch(); setLastEffect("SCRATCH"); }}
        >
          SCRATCH
        </button>
        <button
          className="hw-btn flex-1"
          onClick={() => { engine.keyPad.stopAll(); setLastEffect("TOUT ARRÊTER"); }}
        >
          TOUT ARRÊTER
        </button>
      </div>

      <div className="hw-recess p-2 rounded-lg">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
          Dernier effet
        </div>
        <div className="font-mono bg-[#0a0d0a] text-white p-1 rounded text-center">
          {lastEffect || "AUCUN"}
        </div>
      </div>

      <div className="text-[10px] font-bold text-neutral-300">Source : platine {keySource}</div>
      <div className="text-[10px] text-neutral-500">
        A à K et Z à , : tranches 1 à 16 · Shift : inversée · 1 inverser · 2 maintien · 3 écho · 4 filtre · 5 répétition · 6 DROP HQ · 7 impact · 8 frein · 9 scratch · 0 stop · ↑↓ pitch · ←→ division écho
      </div>
    </div>
  );
};
