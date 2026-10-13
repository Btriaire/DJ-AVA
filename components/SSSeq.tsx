import { useEffect, useRef, useState } from "react";
import { Knob } from "./Knob";

export type SSSeqProps = {
  keyBase: number;
  deckBpm: number;
  now: () => number;
  playStep: (note: number, lengthSec: number, when: number) => void;
  stepsCount: 16;
};

export const SSSeq = ({
  keyBase,
  deckBpm,
  now,
  playStep,
  stepsCount,
}: SSSeqProps) => {
  const [steps, setSteps] = useState(() =>
    Array.from({ length: stepsCount }, () => ({
      on: false,
      note: 0,
    }))
  );
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [ownBpm, setOwnBpm] = useState(120);
  const [swing, setSwing] = useState(0);
  const [gate, setGate] = useState(0.6);

  const stepsRef = useRef(steps);
  const nextTimeRef = useRef(0);
  const stepIndexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const pointerTargetRef = useRef<number | null>(null);
  const pointerYStartRef = useRef(0);

  const bpm = deckBpm > 0 ? deckBpm : ownBpm;
  const stepSec = 60 / bpm / 4;

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    if (!playing) return;

    nextTimeRef.current = now() + 0.05;
    stepIndexRef.current = 0;

    const interval = setInterval(() => {
      const currentTime = now();
      const lookahead = currentTime + 0.12;

      while (nextTimeRef.current < lookahead) {
        const stepIndex = stepIndexRef.current;
        const step = stepsRef.current[stepIndex];

        if (step.on) {
          const when = nextTimeRef.current;
          const adjustedWhen =
            stepIndex % 2 === 1 ? when + swing * stepSec : when;
          playStep(
            keyBase + step.note,
            stepSec * gate,
            adjustedWhen
          );
          setCurrent(stepIndex);
        }

        stepIndexRef.current = (stepIndex + 1) % stepsCount;
        nextTimeRef.current += stepSec;
      }
    }, 25);

    intervalRef.current = interval;
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, swing, gate, bpm, stepSec, keyBase, now, playStep, stepsCount]);

  const handlePlayToggle = () => {
    if (playing) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setPlaying(false);
      setCurrent(-1);
    } else {
      setPlaying(true);
    }
  };

  const handleStepClick = (index: number) => {
    setSteps((prev) => {
      const newSteps = [...prev];
      newSteps[index].on = !newSteps[index].on;
      return newSteps;
    });
  };

  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerTargetRef.current = index;
    pointerYStartRef.current = e.clientY;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerTargetRef.current === null) return;

    const index = pointerTargetRef.current;
    const deltaY = pointerYStartRef.current - e.clientY;
    const newNote = Math.max(
      0,
      Math.min(15, Math.round((deltaY / 120) * 15))
    );

    setSteps((prev) => {
      const newSteps = [...prev];
      newSteps[index] = { on: true, note: newNote };
      return newSteps;
    });
  };

  const handlePointerUp = () => {
    pointerTargetRef.current = null;
  };

  const handleClear = () => {
    setSteps((prev) => prev.map(() => ({ on: false, note: 0 })));
  };

  const handleRandomize = () => {
    if (playing) return;
    setSteps((prev) =>
      prev.map(() => ({
        on: Math.random() < 0.4,
        note: Math.floor(Math.random() * 12),
      }))
    );
  };

  const handleBpmChange = (delta: number) => {
    if (deckBpm > 0) return;
    setOwnBpm((prev) => Math.max(60, Math.min(200, prev + delta)));
  };

  return (
    <div className="bg-[#1a1a1a] p-4 rounded-lg shadow-lg">
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={handlePlayToggle}
          className={`px-6 py-2 rounded-full font-bold ${
            playing ? "bg-green-500" : "bg-[#2a2a2e]"
          }`}
        >
          {playing ? "ARRÊT" : "LECTURE"}
        </button>
        <div className="hw-screen text-[#5ef2ff] font-mono text-lg">
          {bpm} BPM {deckBpm > 0 ? "(PLATINE)" : "(INTERNE)"}
        </div>
        <button
          onClick={() => handleBpmChange(-1)}
          disabled={deckBpm > 0}
          className="px-2 py-1 bg-[#2a2a2e] rounded disabled:opacity-50"
        >
          −
        </button>
        <button
          onClick={() => handleBpmChange(1)}
          disabled={deckBpm > 0}
          className="px-2 py-1 bg-[#2a2a2e] rounded disabled:opacity-50"
        >
          +
        </button>
      </div>

      <div className="grid grid-cols-16 gap-1 mb-4">
        {steps.map((step, index) => (
          <div
            key={index}
            className={`h-60 flex flex-col items-center ${
              current === index ? "bg-[#5ef2ff]/12" : ""
            }`}
            onClick={() => handleStepClick(index)}
            onPointerDown={(e) => handlePointerDown(index, e)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className={`w-8 flex-1 rounded-t ${
                step.on ? "bg-[#fbbf24]" : "bg-[#2a2a2e]"
              } ${current === index ? "bg-[#5ef2ff]" : ""}`}
              style={{ height: `${((step.note + 1) / 16) * 100}%` }}
            />
            <div className="text-xs text-[#5ef2ff] mt-1">
              {index + 1}
              {index % 4 === 0 && (
                <span className="inline-block w-1 h-1 bg-[#5ef2ff] rounded-full ml-1" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 mb-4">
        <Knob
          value={swing}
          min={0}
          max={0.3}
          onChange={setSwing}
          label="SWING"
          format={(v) => `${Math.round(v * 100)}%`}
          size={44}
        />
        <Knob
          value={gate}
          min={0.2}
          max={1}
          onChange={setGate}
          label="GATE"
          format={(v) => `${Math.round(v * 100)}%`}
          size={44}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleClear}
          className="px-4 py-2 bg-[#2a2a2e] rounded"
        >
          EFFACER
        </button>
        <button
          onClick={handleRandomize}
          disabled={playing}
          className="px-4 py-2 bg-[#2a2a2e] rounded disabled:opacity-50"
        >
          ALÉATOIRE
        </button>
      </div>
    </div>
  );
};
