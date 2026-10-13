"use client";
import { useEffect, useMemo, useState } from "react";
import type { Deck } from "@/lib/audio/Deck";
import { DeckPerfo } from "@/lib/audio/Perfo";
import { PerfPad } from "./PerfPad";

const BRAKE_CHOICES = [0.5, 1, 2, 4];
const ECHO_DIV_CHOICES = [
  { label: "1/8", idx: 1 },
  { label: "1/4", idx: 2 },
  { label: "1/2", idx: 3 },
  { label: "1", idx: 5 },
];
const ECHO_HOLD_CHOICES = [1, 2, 4, 8];
const CENSOR_DIV_CHOICES = [
  { label: "1/16", idx: 0 },
  { label: "1/8", idx: 1 },
  { label: "1/4", idx: 2 },
  { label: "1/2", idx: 3 },
];

export function PerfoPanel({ deck, color }: { deck: Deck; color: string }) {
  const perfo = useMemo(() => new DeckPerfo(deck), [deck]); // memoized to avoid recreating on every render
  const [brakeBeats, setBrakeBeats] = useState(1);
  const [echoDiv, setEchoDiv] = useState(3);
  const [echoHold, setEchoHold] = useState(2);
  const [censorDiv, setCensorDiv] = useState(0);
  const [, setV] = useState(0);
  const force = () => setV((n) => n + 1);

  useEffect(() => {
    perfo.setListener(() => force());
    return () => {
      perfo.panic();
      perfo.setListener(null);
    };
  }, [deck, perfo]);

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">
          PERFO
        </span>
        <span className="font-mono text-[11px] text-neutral-300">
          ♩ {deck.bpm > 0 ? deck.bpm.toFixed(1) : "—"}
        </span>
        {perfo.active !== null && (
          <span
            className="text-[10px] font-bold"
            style={{ ["--led" as string]: color }}
          >
            EN COURS
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <PerfPad
          label="BRAKE"
          sub="arrêt platine"
          color="#f87171"
          active={perfo.active === "brake"}
          disabled={!deck.playing}
          height={64}
          title="Arrêt progressif de la platine, comme couper le moteur"
          onDown={() => {
            perfo.brakeDown(brakeBeats);
            force();
          }}
        />
        <PerfPad
          label="ECHO OUT"
          sub="appui : lance · appui : coupe"
          color="#ffcc00"
          active={perfo.active === "echo"}
          height={64}
          title="Écho de sortie calé sur le tempo : il s'éteint en laissant sa queue"
          onDown={() => {
            perfo.echoDown(echoDiv, echoHold);
            force();
          }}
        />
        <PerfPad
          label="CENSOR"
          sub="à maintenir"
          color="#a3e635"
          active={perfo.active === "censor"}
          height={64}
          title="Hache le son au rythme choisi tant que tu maintiens"
          onDown={() => {
            perfo.censorDown(censorDiv);
            force();
          }}
          onUp={() => {
            perfo.censorUp();
            force();
          }}
        />
      </div>

      <div className="hw-recess flex flex-col gap-2 p-2">
        <div className="flex items-center gap-2">
          <span className="w-16 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            ARRÊT
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {BRAKE_CHOICES.map((choice) => (
              <button
                key={choice}
                className={`hw-btn h-8 px-2 py-1 text-[10px] font-bold ${
                  brakeBeats === choice ? "hw-btn-on" : ""
                }`}
                style={{ ["--led" as string]: "#f87171" }}
                onClick={() => setBrakeBeats(choice)}
              >
                {choice === 0.5 ? "1/2" : choice} tps
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-16 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            ÉCHO
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {ECHO_DIV_CHOICES.map((choice) => (
              <button
                key={choice.idx}
                className={`hw-btn h-8 px-2 py-1 text-[10px] font-bold ${
                  echoDiv === choice.idx ? "hw-btn-on" : ""
                }`}
                style={{ ["--led" as string]: "#ffcc00" }}
                onClick={() => setEchoDiv(choice.idx)}
              >
                {choice.label}
              </button>
            ))}
            <span className="mx-1 text-[10px] text-neutral-500">·</span>
            {ECHO_HOLD_CHOICES.map((choice) => (
              <button
                key={choice}
                className={`hw-btn h-8 px-2 py-1 text-[10px] font-bold ${
                  echoHold === choice ? "hw-btn-on" : ""
                }`}
                style={{ ["--led" as string]: "#ffcc00" }}
                onClick={() => setEchoHold(choice)}
                title="Sortie automatique après ce nombre de temps"
              >
                {choice} tps
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-16 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
            COUPURE
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {CENSOR_DIV_CHOICES.map((choice) => (
              <button
                key={choice.idx}
                className={`hw-btn h-8 px-2 py-1 text-[10px] font-bold ${
                  censorDiv === choice.idx ? "hw-btn-on" : ""
                }`}
                style={{ ["--led" as string]: "#a3e635" }}
                onClick={() => setCensorDiv(choice.idx)}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
