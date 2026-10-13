import { useEffect, useRef, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import type { DjPresetId } from "@/lib/audio/DjSynth";
import { EQ_PRESETS, presetGains } from "@/lib/audio/eqPresets";
import { EQ_FREQS } from "@/lib/audio/Rack";

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
    <div className="hw-panel p-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">DANSE</div>
      <div className="text-[11px] text-neutral-400 mb-2">Outils pour les transitions et le son club. Choisis une platine, puis un genre ou un effet.</div>

      <div className="hw-recess p-2 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <button
            className={`hw-btn px-3 py-1.5 text-[11px] font-bold ${deck === engine.deckA ? "hw-btn-on" : ""}`}
            onClick={() => handleDeckChange(engine.deckA)}
          >
            PLATINE A
          </button>
          <button
            className={`hw-btn px-3 py-1.5 text-[11px] font-bold ${deck === engine.deckB ? "hw-btn-on" : ""}`}
            onClick={() => handleDeckChange(engine.deckB)}
          >
            PLATINE B
          </button>
          <div className="flex-1 text-[11px]">
            {deck ? (
              <>
                <span className={`font-bold ${deck === engine.deckA ? "text-[#38bdf8]" : "text-[#f59e0b]"}`}>
                  {deck.name || "sans titre"}
                </span>
                <span className="ml-1 text-neutral-400">{Math.round(deck.bpm) || "--"} BPM</span>
              </>
            ) : (
              <span className="text-neutral-400">Choisis une platine</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 mb-2">
          {GENRES.map((genre) => (
            <button
              key={genre.id}
              className={`hw-btn text-[10px] p-1 h-12 flex flex-col items-start ${activeGenre?.id === genre.id ? "hw-btn-on" : ""}`}
              style={{ backgroundColor: genre.color }}
              onClick={() => applyGenre(genre)}
            >
              <div className="font-bold">{genre.label}</div>
              <div className="text-[9px]">{genre.description}</div>
            </button>
          ))}
        </div>

        <div className="text-[10px] text-neutral-400 mb-2">
          {activeGenre ? (
            <>Appliqué : EQ {activeGenre.eqId} · synthé {activeGenre.synth}</>
          ) : (
            "Choisis un genre pour régler l'EQ et la basse"
          )}
        </div>
      </div>

      <div className="hw-recess p-2 mb-2">
        <div className="flex items-center gap-2 mb-2">
          <button
            className={`hw-btn text-[10px] px-2 py-1 ${pumpOn ? "hw-btn-on" : ""}`}
            onClick={togglePump}
            disabled={!deck?.stemsActive}
          >
            {pumpOn ? "PUMP ON" : "PUMP OFF"}
          </button>
          {!deck?.stemsActive && (
            <div className="text-[10px] text-neutral-400">Fait baisser les stems à chaque temps. Active le mode stems sur la platine d&apos;abord.</div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px] w-12">PROFONDEUR</div>
          <input
            type="range"
            min="0"
            max="100"
            value={pumpDepth}
            onChange={(e) => updatePumpDepth(Number(e.target.value))}
            className="flex-1"
          />
          <div className="text-[10px] w-8 text-right">{pumpDepth}%</div>
          <div className="w-2 h-12 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="bg-neutral-200"
              style={{ height: `${pumpLevel * 100}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <div className="text-[10px]">RELÂCHE</div>
          {RELEASE_BEATS.map((beat) => (
            <button
              key={beat}
              className={`hw-btn text-[10px] px-2 py-1 ${releaseBeats === beat ? "hw-btn-on" : ""}`}
              onClick={() => updateReleaseBeats(beat)}
            >
              {beat === 0.25 ? "1/4" : beat === 0.5 ? "1/2" : "1"}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full ${beatIdx === i ? "bg-neutral-200" : "bg-neutral-700"}`}
            />
          ))}
        </div>
      </div>

      <div className="hw-recess p-2 mb-2">
        <div className="flex gap-1 mb-2">
          {RAMP_LENGTHS.map((len) => (
            <button
              key={len}
              className={`hw-btn text-[10px] px-2 py-1 ${rampLength === len ? "hw-btn-on" : ""}`}
              onClick={() => setRampLength(len)}
            >
              {len}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <button
            className="hw-btn text-[10px] px-2 py-1"
            onClick={startRamp}
            disabled={!deck || rampActive}
          >
            MONTÉE
          </button>
          <button
            className="hw-btn text-[10px] px-2 py-1 bg-red-600"
            onClick={stopRamp}
          >
            DROP
          </button>
          <button
            className={`hw-btn text-[10px] px-2 py-1 ${filterActive ? "hw-btn-on" : ""}`}
            onClick={() => setFilterActive(!filterActive)}
          >
            FILTRE
          </button>
        </div>

        {rampProgress > 0 && (
          <div className="text-[10px] mb-1">
            Montée : {rampLength} temps
          </div>
        )}
        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-neutral-200"
            style={{ width: `${rampProgress * 100}%` }}
          />
        </div>
        <div className="text-[10px] text-neutral-400 mt-1">DROP coupe la montée et le souffle.</div>
      </div>

      <div className="hw-recess p-2">
        <button
          className="hw-btn text-[11px] font-bold w-full py-2 mb-2"
          onClick={transitionStep ? stopTransition : startTransition}
          disabled={!deck}
        >
          {transitionStep ? "ARRÊTER" : "TRANSITION"}
        </button>

        {transitionStep && (
          <>
            <div className="flex justify-between text-[10px] mb-1">
              {TRANSITION_STEPS.map((step) => (
                <div
                  key={step}
                  className={`flex-1 text-center ${transitionStep === step ? "text-neutral-200" : "text-neutral-500"}`}
                >
                  {step}
                </div>
              ))}
            </div>
            <div className="h-2 bg-neutral-700 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-neutral-200"
                style={{ width: `${transitionProgress * 100}%` }}
              />
            </div>
            {transitionStep === "RETOUR" && (
              <div className="text-[10px] text-neutral-400 text-center">Transition terminée</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
