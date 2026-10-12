"use client";
import { useEffect, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { DRUM_VOICES, DRUM_KITS, DRUM_PRESETS, type DrumVoice } from "@/lib/audio/DrumMachine";
import { Knob } from "./Knob";
import { PerfPad } from "./PerfPad";
import { DjFxPanel } from "./DjFxPanel";

export function DrumMachinePanel({ engine }: { engine: DJEngine }) {
  const [, setV] = useState(0);
  const force = () => setV((n) => n + 1);
  const [sel, setSel] = useState<DrumVoice>("kick");
  const [flash, setFlash] = useState<DrumVoice | null>(null);
  const [cur, setCur] = useState(-1);
  const [fxOpen, setFxOpen] = useState(false);

  const m = engine.drums;

  const save = () => {
    try {
      localStorage.setItem("djsynth.drums.v1", JSON.stringify(m.exportState()));
    } catch {}
  };

  useEffect(() => {
    const raw = localStorage.getItem("djsynth.drums.v1");
    if (raw) {
      try {
        m.importState(JSON.parse(raw));
        const t0 = setTimeout(() => setV((n) => n + 1), 0);
        return () => clearTimeout(t0);
      } catch {}
    }

    m.listen((i) => setCur(i));
    const interval = setInterval(() => setV((n) => n + 1), 400);

    return () => {
      m.listen(null);
      clearInterval(interval);
      m.stop();
    };
  }, [engine, m]);

  const handleFlash = (id: DrumVoice) => {
    setFlash(id);
    setTimeout(() => setFlash(null), 130);
  };

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">BOÎTE À RYTHMES</span>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${m.running ? "hw-btn-on" : ""}`}
          style={{ ["--led" as string]: "#4ade80" }}
          onClick={() => { m.toggle(); force(); }}
        >
          {m.running ? "STOP" : "START"}
        </button>
        <span className="text-[10px] font-bold text-neutral-300">
          ♩ {m.bpm.toFixed(1)} {engine.masterDeck() ? "SYNC" : "MANUEL"}
        </span>
        {!engine.masterDeck() && (
          <>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => m.setManualBpm(m.clock.manualBpm - 1)}
            >
              −
            </button>
            <button
              className="hw-btn px-2 py-1 text-[11px] font-bold"
              onClick={() => m.setManualBpm(m.clock.manualBpm + 1)}
            >
              +
            </button>
          </>
        )}
        <div className="flex gap-1">
          {DRUM_KITS.map(({ id, label }) => (
            <button
              key={id}
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${m.kit === id ? "hw-btn-on" : ""}`}
              onClick={() => m.setKit(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {DRUM_PRESETS.map(({ id, name, bpm }) => (
          <button
            key={id}
            className="hw-btn px-2 py-1 text-[11px] font-bold"
            title={`${bpm} BPM`}
            onClick={() => {
              m.loadPreset(id);
              if (!engine.masterDeck()) m.setManualBpm(bpm);
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="hw-recess p-2 overflow-x-auto [contain:inline-size]">
        <div className="min-w-[540px]">
          <div className="flex h-[24px]">
            <div className="w-[72px]" />
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="flex-1 min-w-[24px] text-center text-[10px] text-neutral-500">
                {i % 4 === 0 ? i / 4 + 1 : ""}
              </div>
            ))}
          </div>
          {DRUM_VOICES.map(({ id, label, color }) => (
            <div key={id} className="flex h-[34px] gap-1">
              <PerfPad
                label={label}
                color={color}
                height={34}
                active={flash === id}
                lit={sel === id}
                onDown={() => {
                  m.hit(id, 1);
                  setSel(id);
                  handleFlash(id);
                }}
              />
              <button
                className={`hw-btn px-2 py-1 text-[11px] font-bold ${m.mute[id] ? "hw-btn-on" : ""}`}
                style={{ ["--led" as string]: "#f87171" }}
                onClick={() => m.setMute(id, !m.mute[id])}
              >
                M
              </button>
              {Array.from({ length: 16 }).map((_, i) => {
                const state = m.rows[id][i];
                const isActive = cur === i;
                const isAccent = state === "X";
                const isHit = state === "x" || isAccent;
                const bgColor = isHit ? `${color}${isAccent ? "" : "b3"}` : "#17171b";
                const boxShadow = isHit ? `0 0 ${isAccent ? "14" : "8"}px ${color}` : "none";
                const border = isActive ? "2px solid white" : "1px solid #2a2a30";

                return (
                  <button
                    key={i}
                    className="flex-1 min-w-[24px] rounded-sm"
                    style={{
                      backgroundColor: bgColor,
                      boxShadow,
                      border,
                    }}
                    onClick={() => {
                      m.cycleStep(id, i);
                      save();
                      force();
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="hw-recess p-2 flex items-center gap-2">
        <div
          className="w-4 h-4 rounded-full"
          style={{ backgroundColor: DRUM_VOICES.find((v) => v.id === sel)?.color }}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">
          {DRUM_VOICES.find((v) => v.id === sel)?.label}
        </span>
        <Knob
          label="Niveau"
          value={m.vLevel[sel]}
          min={0}
          max={1.5}
          defaultValue={1}
          onChange={(v) => { m.setVoiceLevel(sel, v); save(); force(); }}
          color="#ff6a3d"
          size={44}
          led
        />
        <Knob
          label="Accord"
          value={m.vTune[sel]}
          min={-1}
          max={1}
          defaultValue={0}
          onChange={(v) => { m.setVoiceTune(sel, v); save(); force(); }}
          color="#ff6a3d"
          size={44}
          led
          format={(v) => `${Math.round(v * 6)} st`}
        />
        <Knob
          label="Durée"
          value={m.vDecay[sel]}
          min={-1}
          max={1}
          defaultValue={0}
          onChange={(v) => { m.setVoiceDecay(sel, v); save(); force(); }}
          color="#ff6a3d"
          size={44}
          led
          format={(v) => `×${(2 ** v).toFixed(2)}`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${m.fill ? "hw-btn-on" : ""}`}
          onPointerDown={() => { m.setFill(true); force(); }}
          onPointerUp={() => { m.setFill(false); force(); }}
          onPointerCancel={() => { m.setFill(false); force(); }}
          onPointerLeave={() => { m.setFill(false); force(); }}
        >
          FILL
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${m.breakMode ? "hw-btn-on" : ""}`}
          onPointerDown={() => { m.setBreak(true); force(); }}
          onPointerUp={() => { m.setBreak(false); force(); }}
          onPointerCancel={() => { m.setBreak(false); force(); }}
          onPointerLeave={() => { m.setBreak(false); force(); }}
        >
          BREAK
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => { m.randomize(); save(); }}
        >
          ALÉA
        </button>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => { m.clear(); save(); }}
        >
          VIDER
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${m.quantizeHits ? "hw-btn-on" : ""}`}
          onClick={() => { m.setQuantize(!m.quantizeHits); force(); }}
        >
          QUANT
        </button>
        <Knob
          label="Swing"
          value={m.swing}
          min={0}
          max={0.6}
          defaultValue={0}
          onChange={(v) => { m.setSwing(v); save(); }}
          color="#ff6a3d"
          size={44}
          led
          format={(v) => `${Math.round(v * 100)}%`}
        />
        <Knob
          label="Volume"
          value={m.level}
          min={0}
          max={1.5}
          defaultValue={0.9}
          onChange={(v) => { m.setLevel(v); save(); }}
          color="#ff6a3d"
          size={44}
          led
        />
      </div>

      <button
        className="hw-btn px-2 py-1 text-[11px] font-bold"
        onClick={() => setFxOpen(!fxOpen)}
      >
        EFFETS {fxOpen ? "▾" : "▴"}
      </button>
      {fxOpen && (
        <div className="hw-recess p-2">
          <DjFxPanel rack={m.fx} color="#ff6a3d" />
        </div>
      )}
    </div>
  );
}
