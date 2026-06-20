"use client";
import { useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { FX_LIST, FxName } from "@/lib/audio/FXRack";
import { Knob } from "./Knob";

interface Props {
  engine: DJEngine;
  tick: number; // rAF heartbeat from the page, drives the live meters/clock
}

// on the BOSS master unit every effect shares one uniform accent colour
const BOSS_FX_COLOR = "#ff8a1e";

// glyph + the 4 knobs that get a quick-access intensity dial
const FX_GLYPH: Record<FxName, string> = {
  echo: "⟲",
  reverb: "〰",
  flanger: "✺",
  phaser: "◐",
  gate: "▥",
  crush: "▦",
};
const KNOB_FX: FxName[] = ["echo", "reverb", "phaser", "crush"];
const KNOB_NUM = ["3", "4", "1", "2"]; // BOSS-style face numbering

function fmtTC(sec: number) {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${ss
    .toString()
    .padStart(2, "0")}`;
}
function fmtClock(d: Date) {
  const p = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

export function BossFxPanel({ engine, tick }: Props) {
  void tick;
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [knob, setKnob] = useState<Record<FxName, number>>(() =>
    KNOB_FX.reduce((a, id) => ({ ...a, [id]: engine.getMasterFx(id) }), {} as Record<FxName, number>)
  );
  const clockRef = useRef(new Date());
  clockRef.current = new Date();

  const meters = engine.getMeters(8);
  const playing = engine.anyPlaying;

  const toggleFx = (id: FxName) => {
    const on = engine.getMasterFx(id) > 0.001;
    const v = on ? 0 : 0.6;
    engine.setMasterFx(id, v);
    if (KNOB_FX.includes(id)) setKnob((k) => ({ ...k, [id]: v }));
    rerender();
  };

  const setKnobFx = (id: FxName, v: number) => {
    engine.setMasterFx(id, v);
    setKnob((k) => ({ ...k, [id]: v }));
  };

  const toggleRec = () => {
    if (engine.isRecording) {
      const blob = engine.stopRecording();
      engine.dlRecorder.onProgress = undefined;
      setRecording(false);
      setRecSec(0);
      if (blob) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `djsynth-mix-${Date.now()}.wav`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      return;
    }
    engine.dlRecorder.onProgress = (s) => {
      setRecSec(s);
      if (!engine.isRecording) setRecording(false); // hit the cap
    };
    engine.startRecording();
    setRecording(true);
    setRecSec(0);
  };

  // keep meters & clock smooth even if the parent tick stalls
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      rerender();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const { date, time } = fmtClock(clockRef.current);
  const SCALE = [0, -15, -30, -45, -60];

  return (
    <div className="zoom-zone hw-screwed boss-panel boss-panel-v flex w-full flex-col items-stretch gap-2 p-2.5">
      {/* header: brand + power + transport (pt clears the corner screws) */}
      <div className="flex items-center justify-between pt-3">
        <div className="boss-logo">BOSS</div>
        <div className="flex items-center gap-1">
          <div className="boss-led-power" title="Power" />
          <button
            className={`boss-tbtn boss-tbtn-play ${playing ? "boss-tbtn-on" : ""}`}
            onClick={() => {
              engine.togglePlayAll();
              rerender();
            }}
            title="Lecture / pause des deux decks"
          >
            ▶
          </button>
          <button
            className={`boss-tbtn boss-tbtn-rec ${recording ? "boss-tbtn-rec-on" : ""}`}
            onClick={toggleRec}
            title="Enregistrer le mix (WAV)"
          >
            ⏺
          </button>
        </div>
      </div>

      {/* LCD screen */}
      <div className="boss-screen relative flex flex-col">
        {/* top status bar: clock + timecode */}
        <div className="flex items-center justify-between border-b border-white/10 px-2 py-1 text-neutral-300">
          <div className="font-mono text-[8px] leading-tight text-neutral-400">
            <div>{date}</div>
            <div>{time}</div>
          </div>
          <div className="flex items-center gap-1 font-mono text-xs font-bold tabular-nums">
            <span className={`boss-recdot ${recording ? "boss-recdot-on" : ""}`} />
            <span className={recording ? "text-red-400" : "text-neutral-200"}>
              {fmtTC(recSec)}
            </span>
          </div>
        </div>

        {/* VU meters */}
        <div className="flex h-20 items-stretch gap-[3px] px-2 py-1.5">
          <div className="flex flex-col justify-between py-[2px] pr-0.5 font-mono text-[6px] text-neutral-600">
            {SCALE.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
          {meters.map((lvl, i) => (
            <div key={i} className="boss-meter relative flex-1">
              <div className="boss-meter-fill" style={{ height: `${Math.min(100, lvl * 135)}%` }} />
              {SCALE.slice(1, -1).map((_, k) => (
                <div
                  key={k}
                  className="absolute left-0 right-0 h-px bg-black/40"
                  style={{ top: `${((k + 1) / (SCALE.length - 1)) * 100}%` }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* FX toggle icon grid */}
        <div className="grid grid-cols-3 gap-1 border-t border-white/10 px-2 py-1.5">
          {FX_LIST.map((fx) => {
            const on = engine.getMasterFx(fx.id) > 0.001;
            return (
              <button
                key={fx.id}
                onClick={() => toggleFx(fx.id)}
                className="boss-fxicon"
                style={on ? { color: BOSS_FX_COLOR, textShadow: `0 0 8px ${BOSS_FX_COLOR}` } : undefined}
                title={`${fx.label} (master)`}
              >
                <span className="text-sm leading-none">{FX_GLYPH[fx.id]}</span>
                <span className="text-[7px] uppercase tracking-wide">{fx.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* knob bank */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-0.5">
        {KNOB_FX.map((id, i) => {
          const fx = FX_LIST.find((f) => f.id === id)!;
          return (
            <Knob
              key={id}
              label={`${KNOB_NUM[i]}·${fx.label}`}
              value={knob[id]}
              min={0}
              max={1}
              defaultValue={0}
              size={32}
              color={BOSS_FX_COLOR}
              format={(v) => `${Math.round(v * 100)}`}
              onChange={(v) => setKnobFx(id, v)}
            />
          );
        })}
      </div>
    </div>
  );
}
