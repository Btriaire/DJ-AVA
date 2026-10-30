import { useEffect, useRef, useState } from "react";
import { ModulePresetBar } from "./ModulePresetBar";
import type { DJEngine } from "@/lib/audio/engine";
import { DRUM_KITS } from "@/lib/drumKits";
import { PAD_SLICES, PAD_SOURCES, ECHO_DIVS, SLICE_DIVS, DRUM_NAMES, type PadBank, type PadSettings } from "@/lib/audio/SamplePad";
import { Knob } from "./Knob";

type Props = {
  engine: DJEngine;
};

const KEY_IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false, false, true, false, true];
const ECHO_LABELS = ["1/4", "1/2", "1", "2"];

export const DJKeyboard = ({ engine }: Props) => {
  const [settings, setSettings] = useState<PadSettings>(engine.keyPad.settings);
  const [activeMask, setActiveMask] = useState(0);
  const [lastEffect, setLastEffect] = useState("");
  const [keySource, setKeySource] = useState(engine.getKeySource());
  const [bank, setBank] = useState<PadBank>("slices");
  const [currentStep, setCurrentStep] = useState(-1);
  const [dropUntil, setDropUntil] = useState<number | null>(null);
  const [showStop, setShowStop] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const measureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const shiftPressed = useRef(false);
  const [, setV] = useState(0);

  const padKeys = [
    "A", "S", "D", "F", "G", "H", "J", "K",
    "Z", "X", "C", "V", "B", "N", "M", ","
  ];


  const toggleBank = () => {
    const next: PadBank = bank === "slices" ? "drums" : "slices";
    engine.keyPad.setBank(next);
    setBank(next);
  };

  // a kit loads in the background: the status line follows it
  useEffect(() => {
    engine.keyPad.setKitListener(() => setSettings({ ...engine.keyPad.settings }));
    return () => engine.keyPad.setKitListener(null);
  }, [engine]);

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
      if (bank === "drums") setLastEffect(DRUM_NAMES[sliceIndex]);
      if (shiftPressed.current) setSetting("reverse", wasReversed);
      return;
    }

    switch (e.code) {
      case "Digit1": setSetting("reverse", !settings.reverse); break;
      case "Digit2": setSetting("hold", !settings.hold); break;
      case "Digit3": setSetting("echo", settings.echo ? 0 : 0.5); break;
      case "Digit4": setSetting("filter", settings.filter === 1 ? 0.25 : 1); break;
      case "Digit5": setSetting("gate", !settings.gate); break;
      case "Digit6":
        engine.keyPad.dropHQ();
        setLastEffect("DROP HQ");
        setDropUntil(Date.now() + 2500);
        setTimeout(() => setDropUntil(null), 2500);
        break;
      case "Digit7": engine.keyPad.impact(); setLastEffect("IMPACT"); break;
      case "Digit8": engine.keyPad.brake(1); setLastEffect("FREIN 1 TEMPS"); break;
      case "Digit9": engine.keyPad.scratch(); setLastEffect("SCRATCH"); break;
      case "Digit0":
        engine.keyPad.stopAll();
        setLastEffect("TOUT ARRÊTER");
        setShowStop(true);
        setTimeout(() => setShowStop(false), 500);
        break;
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
  }, [settings, bank]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      let mask = 0;
      let hasActive = false;
      for (let i = 0; i < PAD_SLICES; i++) {
        if (engine.keyPad.isActive(i)) {
          mask |= 1 << i;
          hasActive = true;
        }
      }
      setActiveMask(mask);
      setShowStop(hasActive && settings.hold);
    }, 50);

    measureIntervalRef.current = setInterval(() => {
      const deck = keySource === "A" ? engine.deckA : engine.deckB;
      if (!deck.fxClock()?.playing) {
        setCurrentStep(-1);
        return;
      }

      const bpm = deck.fxClock()?.bpm ?? deck.bpm;
      const spb = 60 / bpm;
      const position = deck.position();
      const beatOffset = deck.beatGridOffset;
      const barStart = beatOffset + Math.floor((position - beatOffset) / (4 * spb)) * 4 * spb;
      const sliceSec = spb * SLICE_DIVS[engine.keyPad.settings.sliceDiv].beats;
      const step = Math.floor((position - barStart) / sliceSec);
      setCurrentStep(Math.max(0, step) % PAD_SLICES);
    }, 50);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (measureIntervalRef.current) clearInterval(measureIntervalRef.current);
    };
  }, [keySource, settings.hold]);

  const handlePadDown = (slice: number) => {
    const wasReversed = settings.reverse;
    if (shiftPressed.current) setSetting("reverse", true);
    engine.keyPad.trigger(slice);
    if (bank === "drums") setLastEffect(DRUM_NAMES[slice]);
    if (shiftPressed.current) setSetting("reverse", wasReversed);
  };

  const handlePadUp = (slice: number) => {
    engine.keyPad.release(slice);
  };

  const renderKey = (slice: number) => {
    const isActive = (activeMask & (1 << slice)) !== 0;
    const isBlack = KEY_IS_BLACK[slice];
    const isFirstRow = slice < 8;
    const accentColor = isFirstRow ? "#38bdf8" : "#fbbf24";

    const whiteKeysBefore = KEY_IS_BLACK.slice(0, slice).filter(b => !b).length;
    const whiteWidth = 100 / 9.3; // 9 touches blanches + marge pour la 16e touche noire
    const leftPosition = isBlack ? whiteKeysBefore * whiteWidth - whiteWidth * 0.3 : whiteKeysBefore * whiteWidth;

    return (
      <div
        key={slice}
        className={`absolute ${isBlack ? "z-10" : ""} cursor-pointer transition-all`}
        style={{
          left: `${leftPosition}%`,
          width: isBlack ? `${whiteWidth * 0.6}%` : `${whiteWidth}%`,
          height: isBlack ? "62%" : "100%",
          background: isBlack
            ? "linear-gradient(to bottom, #2a2a2e, #050506)"
            : "linear-gradient(to bottom, #f8f7f2, #d9d6cc)",
          borderRadius: "0 0 4px 4px",
          transform: "none",
          border: isActive ? `2px solid ${accentColor}` : "none",
          boxShadow: isActive
            ? `0 0 10px ${accentColor}`
            : isBlack
              ? "0 2px 4px rgba(0,0,0,0.3)"
              : "0 2px 4px rgba(0,0,0,0.2)"
        }}
        onPointerDown={() => handlePadDown(slice)}
        onPointerUp={() => handlePadUp(slice)}
        onPointerLeave={() => handlePadUp(slice)}
      >
        <div className="absolute top-1 left-1 right-1 h-px bg-white/20 rounded-full"></div>
        <div className="absolute bottom-1 left-1 right-1 h-px bg-black/20 rounded-full"></div>
        {!isBlack && (
          <div className="absolute bottom-1 left-1 right-1 text-[8px] text-center text-neutral-600">
            <div>{padKeys[slice]}</div>
            <div>{bank === "drums" ? DRUM_NAMES[slice] : slice + 1}</div>
          </div>
        )}
        {isBlack && (
          <div className="absolute bottom-1 left-1 right-1 text-[8px] text-center text-white">
            {padKeys[slice]}
          </div>
        )}
      </div>
    );
  };

  const renderMeasureBar = () => (
    <div className="flex gap-0.5 mb-2">
      {Array.from({ length: 16 }, (_, i) => (
        <div
          key={i}
          className={`h-1 w-1 rounded-sm ${currentStep === i ? "bg-white" : "bg-neutral-700"}`}
        ></div>
      ))}
    </div>
  );

  const renderLCD = () => {
    const pitchText = settings.pitch === 0 ? "PITCH 0" : `PITCH ${settings.pitch > 0 ? "+" : ""}${settings.pitch}`;
    const modeText = settings.hold ? "MAINTIEN" : "";
    const bankText = bank === "drums" ? "BATTERIE" : "TRANCHES";

    return (
      <div className="hw-screen font-mono text-sm p-1 mb-2 text-cyan-300">
        <div className="truncate">{lastEffect || "PRÊT"}</div>
        <div className="truncate text-[10px] opacity-80">
          {bankText} · {pitchText} {modeText && `· ${modeText}`}
        </div>
        <div className="flex gap-0.5 mt-1">
          {Array.from({ length: 16 }, (_, i) => {
            const isActive = (activeMask & (1 << i)) !== 0;
            const accentColor = i < 8 ? "#38bdf8" : "#fbbf24";
            return (
              <div
                key={i}
                className="h-1 w-1 rounded-sm"
                style={{ backgroundColor: isActive ? accentColor : "#1e293b" }}
              ></div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full @[640px]:grid @[640px]:grid-cols-[minmax(0,1fr)_230px] gap-3">
      <div className="hw-carbon hw-screwed p-4 space-y-4 rounded-lg">
        <ModulePresetBar engine={engine} id="djkeys" label="DJ Keys" onApplied={() => setSettings({ ...engine.keyPad.settings })} />
        <div className="hw-brushed p-2 rounded-t-lg flex justify-between items-center">
          <div className="text-xs font-bold">DJ KEYS</div>
          <div className="flex items-center gap-2">
            <div className={`hw-led ${showStop ? "animate-pulse" : ""}`} style={{ color: "#22c55e" }}></div>
            <div className="text-xs">PLATINE {keySource}</div>
          </div>
        </div>

        <div className="hw-recess p-2 rounded-lg text-[11px] leading-snug text-neutral-300">
          <b className="text-neutral-100">Comment jouer :</b> lance un morceau sur la platine, puis <b className="text-neutral-100">maintiens une touche</b>. Chaque touche = un temps, à partir de la mesure en cours : les 16 touches couvrent 4 mesures (réglable avec TRANCHE). Tant que tu tiens la touche, ce temps se répète en rythme et, avec REMPLACE, la platine se tait ; lâche et le morceau reprend. Enchaîne plusieurs touches pour refaire le groove. Source : prends les tranches dans un seul stem (batterie, voix…).
        </div>
        <div className="hw-recess p-2 rounded-lg space-y-2">
          {renderLCD()}
          {renderMeasureBar()}

          <div className="relative h-44 w-full overflow-hidden rounded-b-md">
            {Array.from({ length: PAD_SLICES }, (_, i) => renderKey(i))}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[var(--jam-text-2)]">Source</span>
              {PAD_SOURCES.map((source, i) => (
                <button
                  key={source.id}
                  className={`hw-btn px-2 py-0.5 text-[10px] ${settings.source === i ? "hw-btn-on" : ""}`}
                  aria-pressed={settings.source === i}
                  onClick={() => setSetting("source", i)}
                  title={i === 0 ? "Tranches prises dans le morceau entier" : `Tranches prises dans le stem ${source.label.toLowerCase()} seul`}
                >
                  {source.label}
                </button>
              ))}
            </div>
            <button
              className={`hw-btn ${settings.onHits ? "hw-btn-on" : ""}`}
              aria-pressed={settings.onHits}
              onClick={() => setSetting("onHits", !settings.onHits)}
              title="Chaque touche part sur un des prochains vrais coups du morceau (batterie, notes, voix) et dure jusqu'au suivant, au lieu d'une grille fixe"
            >
              SUR LES COUPS
            </button>
            <button
              className={`hw-btn ${settings.quant ? "hw-btn-on" : ""}`}
              aria-pressed={settings.quant}
              onClick={() => setSetting("quant", !settings.quant)}
              title="Une touche attend la prochaine double croche (le prochain temps pour une phrase) : on peut jouer large et rester en rythme"
            >
              AU TEMPS
            </button>
            {bank === "drums" && (
              <div className="flex flex-col gap-1">
                <select
                  aria-label="Sons de la batterie"
                  className="hw-input text-[11px]"
                  value={settings.kit}
                  onChange={(e) => setSetting("kit", Number(e.target.value))}
                >
                  <option value={0}>Sons synthétiques</option>
                  {DRUM_KITS.map((k, i) => (
                    <option key={k.id} value={i + 1}>{k.label} · {k.style}</option>
                  ))}
                </select>
                {engine.keyPad.kitStatus() && (
                  <div className="text-[10px] text-[var(--jam-text-3)]" aria-live="polite">{engine.keyPad.kitStatus()}</div>
                )}
              </div>
            )}
            {(() => {
              const deck = keySource === "A" ? engine.deckA : engine.deckB;
              if (settings.source > 0 && !(deck.stemsActive && deck.stemReady)) {
                return <div className="text-[10px] text-[var(--jam-text-3)]" aria-live="polite">Stems non joués sur cette platine : les tranches viennent du morceau entier.</div>;
              } else if (PAD_SOURCES[settings.source]?.id === "phrases") {
                return <div className="text-[10px] text-[var(--jam-text-3)]" aria-live="polite">{deck.stemMap?.voice?.length ? "Chaque touche = une phrase chantée, à partir de la mesure en cours." : "Voix pas encore analysée : les touches restent sur la grille."}</div>;
              } else if (settings.onHits && !deck.stemNotes) {
                return <div className="text-[10px] text-[var(--jam-text-3)]" aria-live="polite">Coups du morceau pas encore analysés : les touches restent sur la grille.</div>;
              } else if (settings.onHits) {
                return <div className="text-[10px] text-[var(--jam-text-3)]" aria-live="polite">Chaque touche = un vrai coup, à partir du début de la mesure.</div>;
              }
              return null;
            })()}
          </div>

          <div className="grid grid-cols-2 gap-1">
            <button
              className={`hw-btn ${settings.replace ? "hw-btn-on" : ""}`}
              onClick={() => setSetting("replace", !settings.replace)}
              aria-pressed={settings.replace}
              title="La platine (ou le stem choisi en Source) se tait pendant que tu joues : la touche remplace la musique, puis la musique revient quand tu lâches"
            >
              REMPLACE
            </button>
            <button
              className={`hw-btn ${settings.reverse ? "hw-btn-on" : ""}`}
              onClick={() => setSetting("reverse", !settings.reverse)}
              aria-pressed={settings.reverse}
              title="Joue chaque tranche à l'envers"
            >
              À L&apos;ENVERS
            </button>
            <button
              className={`hw-btn ${settings.hold ? "hw-btn-on" : ""} ${showStop && settings.hold ? "animate-pulse" : ""}`}
              onClick={() => setSetting("hold", !settings.hold)}
              aria-pressed={settings.hold}
              title="Une touche continue après l'avoir lâchée ; appuie encore pour l'arrêter"
            >
              MAINTIEN
            </button>
            <button
              className={`hw-btn ${bank === "drums" ? "hw-btn-on" : ""}`}
              onClick={toggleBank}
              aria-pressed={bank === "drums"}
              title="Remplace les tranches du morceau par 16 sons de batterie"
            >
              BATTERIE
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              className={`hw-btn ${keySource === "A" ? "hw-btn-on" : ""}`}
              onClick={() => { engine.setKeySource("A"); setKeySource("A"); }}
            >
              PLATINE A
            </button>
            <button
              className={`hw-btn ${keySource === "B" ? "hw-btn-on" : ""}`}
              onClick={() => { engine.setKeySource("B"); setKeySource("B"); }}
            >
              PLATINE B
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1 text-[10px]">
            <button
              className={`hw-btn bg-[#f43f5e] text-white ${dropUntil ? "animate-pulse" : ""}`}
              onClick={() => {
                engine.keyPad.dropHQ();
                setLastEffect("DROP HQ");
                setDropUntil(Date.now() + 2500);
                setTimeout(() => setDropUntil(null), 2500);
              }}
              title="Remontée inversée de 4 mesures jusqu'au drop"
            >
              {dropUntil ? "DROP EN COURS" : "DROP HQ"}
            </button>
            <button
              className="hw-btn"
              onClick={() => { engine.keyPad.impact(); setLastEffect("IMPACT"); }}
              title="Coup de basse et bruit"
            >
              IMPACT
            </button>
            <button
              className="hw-btn"
              onClick={() => { engine.keyPad.brake(1); setLastEffect("FREIN 1 TEMPS"); }}
              title="Ralentit le son jusqu'à l'arrêt, sur 1 temps"
            >
              FREIN 1 TEMPS
            </button>
            <button
              className="hw-btn"
              onClick={() => { engine.keyPad.scratch(); setLastEffect("SCRATCH"); }}
              title="Effet scratch sur la dernière tranche jouée"
            >
              SCRATCH
            </button>
            <button
              className={`hw-btn text-white font-black ${activeMask !== 0 || showStop ? "animate-pulse" : ""}`}
              style={{ background: "linear-gradient(180deg, #f87171 0%, #dc2626 55%, #991b1b 100%)", boxShadow: "0 0 12px rgba(239,68,68,0.6)" }}
              onClick={() => {
                engine.keyPad.stopAll();
                setLastEffect("TOUT ARRÊTER");
                setShowStop(true);
                setTimeout(() => setShowStop(false), 500);
              }}
              title="Coupe tous les sons, écho compris"
            >
              STOP
            </button>
          </div>
        </div>
      </div>

      <div className="hw-recess p-3 flex flex-col space-y-3">
        <div className="flex flex-col items-center space-y-1">
          <input
            type="range"
            className="hw-cfader h-32 rotate-180"
            min="-12"
            max="12"
            step="1"
            value={settings.pitch}
            onChange={(e) => setSetting("pitch", Number(e.target.value))}
            onPointerUp={() => setSetting("pitch", 0)}
            title="Transpose les tranches de ±12 demi-tons ; revient à 0 au relâchement"
          />
          <div className="text-[10px]">TRANSPO +12</div>
          <div className="text-[10px]">0</div>
          <div className="text-[10px]">-12</div>
        </div>

        <div className="flex flex-col space-y-3">
          <Knob
            label="FILTRE"
            value={settings.filter}
            min={0}
            max={1}
            defaultValue={0.5}
            size={48}
            color="#fbbf24"
            led={false}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setSetting("filter", v)}
          />
          <Knob
            label="ÉCHO"
            value={settings.echo}
            min={0}
            max={1}
            defaultValue={0.5}
            size={48}
            color="#f43f5e"
            led={false}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setSetting("echo", v)}
          />
          <Knob
            label="DIVISION"
            value={settings.echoDiv}
            min={0}
            max={3}
            defaultValue={1}
            size={48}
            color="#38bdf8"
            led={false}
            format={(v) => ECHO_LABELS[v]}
            onChange={(v) => setSetting("echoDiv", Math.round(v))}
          />
          <Knob
            label="TRANCHE"
            value={settings.sliceDiv}
            min={0}
            max={SLICE_DIVS.length - 1}
            defaultValue={2}
            size={48}
            color="#a3e635"
            led={false}
            format={(v) => SLICE_DIVS[Math.round(v)].label}
            onChange={(v) => setSetting("sliceDiv", Math.round(v))}
          />
          <Knob
            label="VOL"
            value={settings.volume}
            min={0}
            max={1.5}
            defaultValue={0.8}
            size={48}
            color="#22d3ee"
            led={false}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setSetting("volume", v)}
          />
          <Knob
            label="REVERB"
            value={settings.reverb}
            min={0}
            max={1}
            defaultValue={0.35}
            size={48}
            color="#a78bfa"
            led={false}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => setSetting("reverb", v)}
          />
        </div>
      </div>
    </div>
  );
};
