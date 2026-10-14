import { useEffect, useRef, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { DjPresetId } from "@/lib/audio/DjSynth";
import { EQ_PRESETS, presetGains } from "@/lib/audio/eqPresets";
import { EQ_FREQS } from "@/lib/audio/Rack";
import { Knob } from "./Knob";

type Deck = DJEngine["deckA"];
type Genre = {
  id: string;
  label: string;
  description: string;
  eqId: string;
  synth: DjPresetId;
  color: string;
};

const GENRES: Genre[] = [
  { id: "house", label: "HOUSE", description: "Basse ronde, médium chaud", eqId: "club", synth: "sub", color: "#fbbf24" },
  { id: "techno", label: "TECHNO", description: "Grave punchy, médium creusé", eqId: "techno", synth: "acid", color: "#a3e635" },
  { id: "electro", label: "ÉLECTRO", description: "Aigus brillants, son large", eqId: "brillant", synth: "reese", color: "#38bdf8" },
  { id: "hiphop", label: "HIP-HOP", description: "Grave profond, boom", eqId: "sub", synth: "sub", color: "#f472b6" },
  { id: "disco", label: "DISCO", description: "Médium chaud, aigus doux", eqId: "chaud", synth: "stab", color: "#fb923c" },
  { id: "dub", label: "DUB", description: "Grave lourd, aigus coupés", eqId: "sub", synth: "wobble", color: "#a78bfa" },
];

const RELEASE_BEATS = [0.25, 0.5, 1] as const;
const RAMP_LENGTHS = [2, 4, 8, 16] as const;
const TRANSITION_STEPS = ["MONTÉE", "DROP", "RETOUR"] as const;

export function DancePanel({ engine }: { engine: DJEngine }) {
  const [deck, setDeck] = useState<Deck | null>(engine.deckA);
  const [activeGenre, setActiveGenre] = useState<Genre | null>(null);
  const [pumpOn, setPumpOn] = useState(false);
  const [pumpDepth, setPumpDepth] = useState(80);
  const [releaseBeats, setReleaseBeats] = useState<typeof RELEASE_BEATS[number]>(0.5);
  const [beatIdx, setBeatIdx] = useState(0);
  const [rampLength, setRampLength] = useState<typeof RAMP_LENGTHS[number]>(8);
  const [rampProgress, setRampProgress] = useState(0);
  const [filterActive, setFilterActive] = useState(true);
  const [transitionStep, setTransitionStep] = useState<typeof TRANSITION_STEPS[number] | null>(null);
  const [transitionProgress, setTransitionProgress] = useState(0);
  const [pumpLevel, setPumpLevel] = useState(0);

  const beatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const rampIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pumpIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [rampActive, setRampActive] = useState(false);

  const handleDeckChange = (d: Deck | null) => {
    stopRamp();
    setDeck(d);
    setPumpOn(false);
    setActiveGenre(null);
    stopTransition();
  };

  const applyGenre = (genre: Genre) => {
    if (!deck) return;

    const preset = EQ_PRESETS.find(p => p.id === genre.eqId);
    if (preset) {
      const gains = presetGains(preset.pts, EQ_FREQS);
      EQ_FREQS.forEach((_, i) => deck.rack.setParam("eq", `g${i}`, gains[i]));
      engine.djSynth.setPreset(genre.synth);
      setActiveGenre(genre);
    }
  };

  const togglePump = () => {
    if (!deck || !deck.stemsActive) return;
    const newState = !pumpOn;
    setPumpOn(newState);
    deck.setStemPump(newState, pumpDepth / 100, releaseBeats);
  };

  const updatePumpDepth = (value: number) => {
    setPumpDepth(value);
    if (pumpOn && deck) deck.setStemPump(true, value / 100, releaseBeats);
  };

  const updateReleaseBeats = (value: typeof RELEASE_BEATS[number]) => {
    setReleaseBeats(value);
    if (pumpOn && deck) deck.setStemPump(true, pumpDepth / 100, value);
  };

  const startRamp = () => {
    if (!deck || rampIntervalRef.current) return;
    setRampActive(true);

    const bpm = deck.fxClock()?.bpm || deck.bpm || 120;
    const durMs = (60000 / bpm) * rampLength;
    const t0 = performance.now();

    deck.setFxWet("noise", 0);
    if (filterActive) {
      deck.setFxWet("sweep", 1);
      deck.setFxParam("sweep", "p1", 0);
    }

    rampIntervalRef.current = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / durMs);
      deck.setFxWet("noise", p * p);
      if (filterActive) deck.setFxParam("sweep", "p1", p * 0.5);
      setRampProgress(p);

      if (p >= 1) {
        clearInterval(rampIntervalRef.current!);
        rampIntervalRef.current = null;
        setRampActive(false);
      }
    }, 50);
  };

  const stopRamp = () => {
    setRampActive(false);
    if (rampIntervalRef.current) {
      clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
    }
    if (deck) {
      deck.setFxWet("noise", 0);
      deck.setFxWet("sweep", 0);
    }
    setRampProgress(0);
  };

  const startTransition = () => {
    if (!deck || transitionStep) return;

    const bpm = deck.fxClock()?.bpm || deck.bpm || 120;
    const durMs = (60000 / bpm) * rampLength;
    const wasPumping = pumpOn;

    setTransitionStep("MONTÉE");
    setTransitionProgress(0);

    // Step 1: Ramp up
    const t0 = performance.now();
    deck.setFxWet("noise", 0);
    if (filterActive) {
      deck.setFxWet("sweep", 1);
      deck.setFxParam("sweep", "p1", 0);
    }

    const rampInterval = setInterval(() => {
      const p = Math.min(1, (performance.now() - t0) / durMs);
      deck.setFxWet("noise", p * p);
      if (filterActive) deck.setFxParam("sweep", "p1", p * 0.5);
      setTransitionProgress(p);

      if (p >= 1) {
        clearInterval(rampInterval);
        setTransitionStep("DROP");
        setTransitionProgress(0);

        // Step 2: Drop
        deck.setFxWet("noise", 0);
        deck.setFxWet("sweep", 0);
        deck.setStemPump(false);

        transitionTimeoutRef.current = setTimeout(() => {
          // Step 3: Return
          setTransitionStep("RETOUR");
          setTransitionProgress(0);

          if (wasPumping) {
            deck.setStemPump(true, pumpDepth / 100, releaseBeats);
          }

          setTimeout(() => {
            setTransitionStep(null);
            setTransitionProgress(0);
          }, 1000);
        }, (60000 / bpm) * 2);
      }
    }, 50);

    rampIntervalRef.current = rampInterval;
  };

  // stop everything this panel started on a deck when the deck changes or the panel closes
  useEffect(() => {
    const previous = deck;
    return () => {
      if (!previous) return;
      previous.setStemPump(false);
      previous.setFxWet("noise", 0);
      previous.setFxWet("sweep", 0);
      if (rampIntervalRef.current) clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
      if (pumpIntervalRef.current) clearInterval(pumpIntervalRef.current);
      pumpIntervalRef.current = null;
    };
  }, [deck]);

  const stopTransition = () => {
    if (rampIntervalRef.current) {
      clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (deck) {
      deck.setFxWet("noise", 0);
      deck.setFxWet("sweep", 0);
    }
    setTransitionStep(null);
    setTransitionProgress(0);
  };

  useEffect(() => {
    if (!deck) return;

    // Beat indicator
    beatIntervalRef.current = setInterval(() => {
      const clock = deck.fxClock();
      if (clock?.playing && clock.nextBeat) {
        const beat = Math.max(0, (clock.nextBeat - 1) % 4);
        setBeatIdx(beat);
      } else {
        setBeatIdx(-1);
      }
    }, 100);

    // Pump level indicator
    pumpIntervalRef.current = setInterval(() => {
      const clock = deck.fxClock();
      if (!clock?.playing || !pumpOn) {
        setPumpLevel(0);
        return;
      }

      const bpm = clock.bpm || deck.bpm || 120;
      const spb = 60 / bpm;
      const tSince = spb - (clock.toNextBeat || 0);
      const release = releaseBeats * spb;
      const level = 1 - (pumpDepth / 100) * Math.max(0, 1 - tSince / release);
      setPumpLevel(1 - level);
    }, 50);

    return () => {
      if (beatIntervalRef.current) clearInterval(beatIntervalRef.current);
      if (rampIntervalRef.current) clearInterval(rampIntervalRef.current);
      if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
      if (pumpIntervalRef.current) clearInterval(pumpIntervalRef.current);
    };
  }, [deck, pumpOn, pumpDepth, releaseBeats]);

  return (
    <div className="hw-panel">
      <div className="hw-brushed p-2 flex justify-between">
        <div className="text-xs font-bold">DANSE</div>
        <div className="flex items-center gap-1">
          {deck ? (
            <>
              <span className={`text-[11px] font-bold ${deck === engine.deckA ? "text-[#38bdf8]" : "text-[#f59e0b]"}`}>
                {deck.name || "sans titre"}
              </span>
              <span className="text-[10px] text-neutral-400">{Math.round(deck.bpm) || "--"} BPM</span>
            </>
          ) : (
            <span className="text-[10px] text-neutral-400">Choisis une platine</span>
          )}
          <div className={`hw-led ${pumpOn || rampActive ? "bg-[#22c55e]" : "bg-neutral-700"}`} />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="hw-recess p-3 space-y-3">
          <div className="text-[10px] tracking-[0.2em] text-neutral-400">PLATINE</div>
          <div className="flex gap-2">
            <button
              className={`hw-btn ${deck === engine.deckA ? "hw-btn-on" : ""}`}
              onClick={() => handleDeckChange(engine.deckA)}
            >
              PLATINE A
            </button>
            <button
              className={`hw-btn ${deck === engine.deckB ? "hw-btn-on" : ""}`}
              onClick={() => handleDeckChange(engine.deckB)}
            >
              PLATINE B
            </button>
          </div>

          <div className="text-[10px] tracking-[0.2em] text-neutral-400">GENRE</div>
          <div className="grid grid-cols-2 gap-2">
            {GENRES.map((genre) => (
              <button
                key={genre.id}
                className={`hw-btn h-12 px-2 flex-col items-start justify-center ${activeGenre?.id === genre.id ? "hw-btn-on" : ""}`}
                style={{ backgroundColor: genre.color }}
                onClick={() => applyGenre(genre)}
              >
                <div className="font-bold text-[11px]">{genre.label}</div>
                <div className="text-[9px] opacity-80 truncate">{genre.description}</div>
              </button>
            ))}
          </div>

          <div className="text-[10px] text-neutral-400">
            {activeGenre ? (
              <>Appliqué : EQ {activeGenre.eqId} · synthé {activeGenre.synth}</>
            ) : (
              "Choisis un genre pour régler l'EQ et la basse"
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="hw-recess p-3">
            <div className="text-[10px] tracking-[0.2em] text-neutral-400 mb-2">PUMP</div>
            <div className="flex items-center gap-3">
              <button
                className={`hw-btn ${pumpOn ? "hw-btn-on" : ""}`}
                onClick={togglePump}
                disabled={!deck?.stemsActive}
              >
                {pumpOn ? "PUMP ON" : "PUMP OFF"}
              </button>
              <Knob
                label="PROFONDEUR"
                value={pumpDepth}
                min={0}
                max={100}
                defaultValue={80}
                size={56}
                led={false}
                format={(v) => `${Math.round(v)}%`}
                onChange={(v) => updatePumpDepth(Math.round(v))}
              />
              <div className="hw-recess w-2 h-14 rounded-full overflow-hidden">
                <div
                  className="bg-neutral-200 rounded-full"
                  style={{ height: `${pumpLevel * 100}%` }}
                />
              </div>
            </div>
            {!deck?.stemsActive && (
              <div className="text-[10px] text-neutral-400 mt-2">Active le mode stems sur la platine pour utiliser le pump.</div>
            )}
          </div>

          <div className="hw-recess p-3 space-y-3">
            <div className="text-[10px] tracking-[0.2em] text-neutral-400">MONTÉE</div>
            <div className="flex gap-1">
              {RAMP_LENGTHS.map((len) => (
                <button
                  key={len}
                  className={`hw-btn ${rampLength === len ? "hw-btn-on" : ""}`}
                  onClick={() => setRampLength(len)}
                >
                  {len}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                className="hw-btn"
                onClick={startRamp}
                disabled={!deck || rampActive}
              >
                MONTÉE
              </button>
              <button
                className="hw-btn bg-red-600"
                onClick={stopRamp}
              >
                DROP
              </button>
              <button
                className={`hw-btn ${filterActive ? "hw-btn-on" : ""}`}
                onClick={() => setFilterActive(!filterActive)}
              >
                FILTRE
              </button>
            </div>
            <div className="h-2 hw-recess rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-200"
                style={{ width: `${rampProgress * 100}%` }}
              />
            </div>
            <div className="text-[10px] text-neutral-400">DROP coupe la montée et le souffle.</div>
            {rampProgress > 0 && (
              <div className="text-[10px] text-neutral-400">Montée : {rampLength} temps</div>
            )}
          </div>

          <div className="hw-recess p-3 space-y-3">
            <div className="text-[10px] tracking-[0.2em] text-neutral-400">RELÂCHE</div>
            <div className="flex gap-2">
              {RELEASE_BEATS.map((beat) => (
                <button
                  key={beat}
                  className={`hw-btn ${releaseBeats === beat ? "hw-btn-on" : ""}`}
                  onClick={() => updateReleaseBeats(beat)}
                >
                  {beat === 0.25 ? "1/4" : beat === 0.5 ? "1/2" : "1"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`hw-led ${beatIdx === i ? "bg-[#e879f9]" : "bg-neutral-700"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="hw-recess p-3 mt-3">
        <button
          className="hw-btn w-full"
          onClick={transitionStep ? stopTransition : startTransition}
          disabled={!deck}
        >
          {transitionStep ? "ARRÊTER" : "TRANSITION"}
        </button>

        {transitionStep && (
          <>
            <div className="flex justify-between text-[10px] mt-2">
              {TRANSITION_STEPS.map((step) => (
                <div
                  key={step}
                  className={`flex-1 text-center ${transitionStep === step ? "text-neutral-100 font-bold" : "text-neutral-500"}`}
                >
                  {step}
                </div>
              ))}
            </div>
            <div className="h-2 hw-recess rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-neutral-200"
                style={{ width: `${transitionProgress * 100}%` }}
              />
            </div>
            {transitionStep === "RETOUR" && (
              <div className="text-[10px] text-neutral-400 text-center mt-1">Transition terminée</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
