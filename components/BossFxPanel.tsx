"use client";
import { useEffect, useRef, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { FX_LIST, FxName } from "@/lib/audio/FXRack";
import { Knob } from "./Knob";

interface Props {
  engine: DJEngine;
  tick: number;
}

const BOSS_FX_COLOR = "#ffcc00";
const KNOB_FX: FxName[] = ["echo", "reverb", "phaser", "crush"];
const KNOB_LABELS: Partial<Record<FxName, string>> = {
  echo: "ÉCHO",
  reverb: "RÉVERB",
  phaser: "PHASER",
  crush: "CRUSH"
};

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
  const [selectedFx, setSelectedFx] = useState<FxName | null>(null);
  const clockRef = useRef(new Date());
  clockRef.current = new Date();

  const meters = engine.getMeters(8);
  const playing = engine.anyPlaying;
  const SCALE = [0, -15, -30, -45, -60];

  const toggleFx = (id: FxName) => {
    const on = engine.getMasterFx(id) > 0.001;
    const v = on ? 0 : 0.6;
    engine.setMasterFx(id, v);
    if (!on) setSelectedFx(id);
    rerender();
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
      if (!engine.isRecording) setRecording(false);
    };
    engine.startRecording();
    setRecording(true);
    setRecSec(0);
  };

  const cutAllFx = () => {
    FX_LIST.forEach(fx => engine.setMasterFx(fx.id, 0));
    setSelectedFx(null);
    rerender();
  };

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      const interval = engine.anyPlaying ? 33 : 250;
      if (now - last >= interval) {
        rerender();
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  const { date, time } = fmtClock(clockRef.current);

  return (
    <div className="zoom-zone hw-screwed boss-panel boss-panel-v flex w-full flex-col items-stretch gap-2 p-2.5">
      <div className="flex flex-col items-start gap-1.5 pt-3">
        <div className="boss-logo">BOSS</div>
        <div className="flex flex-wrap items-center gap-1">
          <button
            className={`boss-tbtn boss-tbtn-play ${playing ? "boss-tbtn-on" : ""}`}
            onClick={() => {
              engine.togglePlayAll();
              rerender();
            }}
            title="Lecture / pause des deux decks"
          >
            LECTURE
          </button>
          <button
            className={`boss-tbtn boss-tbtn-rec ${recording ? "boss-tbtn-rec-on" : ""}`}
            onClick={toggleRec}
            title="Enregistrer le mix (WAV)"
          >
            ENREG.
          </button>
          <button
            className="boss-tbtn boss-tbtn-cut"
            onClick={cutAllFx}
            title="Couper tous les effets"
          >
            TOUT COUPER
          </button>
        </div>
      </div>

      <div className="text-xs text-neutral-400 px-2">
        Touche un effet pour l&apos;activer (niveau 60 %) ou le couper. Sélectionne-le pour régler son niveau.
      </div>

      <div className="boss-screen relative flex flex-col">
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

        <div className="grid grid-cols-3 gap-1 border-t border-white/10 px-2 py-1.5">
          {FX_LIST.map((fx) => {
            const on = engine.getMasterFx(fx.id) > 0.001;
            const isSelected = selectedFx === fx.id;
            return (
              <button
                key={fx.id}
                onClick={() => toggleFx(fx.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setSelectedFx(fx.id);
                }}
                className={`boss-fxicon ${isSelected ? "border border-white" : ""}`}
                style={on ? { backgroundColor: BOSS_FX_COLOR, color: "#111" } : undefined}
                title={fx.title}
              >
                <span className="text-sm leading-none">{fx.glyph}</span>
                <span className="text-[7px] uppercase tracking-wide">{fx.label}</span>
                <span className="text-[6px]">{on ? "ON" : "OFF"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedFx && (
        <div className="border-t border-white/10 pt-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">{FX_LIST.find(f => f.id === selectedFx)?.label}</div>
              <div className="text-xs text-neutral-400">{FX_LIST.find(f => f.id === selectedFx)?.title}</div>
            </div>
            <button
              className="boss-tbtn boss-tbtn-cut"
              onClick={() => {
                engine.setMasterFx(selectedFx, 0);
                rerender();
              }}
            >
              COUPER
            </button>
          </div>
          <Knob
            label="NIVEAU"
            value={engine.getMasterFx(selectedFx)}
            min={0}
            max={1}
            defaultValue={0}
            size={40}
            color={BOSS_FX_COLOR}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => {
              engine.setMasterFx(selectedFx, v);
              rerender();
            }}
          />
        </div>
      )}

      <div className="border-t border-white/10 pt-2">
        <div className="text-xs font-bold mb-1">RÉGLAGES RAPIDES</div>
        <div className="grid grid-cols-2 gap-2">
          {KNOB_FX.map((id) => (
            <Knob
              key={id}
              label={KNOB_LABELS[id] ?? ""}
              value={engine.getMasterFx(id)}
              min={0}
              max={1}
              defaultValue={0}
              size={32}
              color={BOSS_FX_COLOR}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => {
                engine.setMasterFx(id, v);
                rerender();
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
