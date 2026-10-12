"use client";
import { useEffect, useState } from "react";
import { DJEngine } from "@/lib/audio/engine";
import { DJ_PRESETS, ARP_DIVS } from "@/lib/audio/DjSynth";
import { BEAT_LABELS } from "@/lib/audio/fxTypes";
import { SCALES, CHORDS, ARP_PATTERNS, NOTE_NAMES, midiName, type ScaleId } from "@/lib/audio/theory";
import { Knob } from "./Knob";
import { FxXyPad } from "./FxXyPad";
import { PerfPad } from "./PerfPad";
import { DjFxPanel } from "./DjFxPanel";
import type { FxName } from "@/lib/audio/FXRack";

export function DjSynthPanel({ engine }: { engine: DJEngine }) {
  const s = engine.djSynth;
  const [held, setHeld] = useState(new Set<number>());
  const [auto, setAuto] = useState(true);
  const [fxOpen, setFxOpen] = useState(false);
  const [, setV] = useState(0);
  const force = () => setV((n) => n + 1);

  const save = () => {
    try {
      localStorage.setItem("djsynth.djsynth.v1", JSON.stringify(s.exportState()));
      localStorage.setItem("djsynth.djsynth.auto", auto ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    const t0 = setTimeout(() => {
      try {
        const raw = localStorage.getItem("djsynth.djsynth.v1");
        if (raw) s.importState(JSON.parse(raw));
      } catch {}
    }, 0);

    const t1 = setTimeout(() => {
      try {
        const raw = localStorage.getItem("djsynth.djsynth.auto");
        setAuto(raw !== "0");
      } catch {}
    }, 0);

    const interval = setInterval(() => {
      if (auto) {
        const k = engine.masterDeck()?.effectiveKey;
        if (k) {
          const newScale: ScaleId = k.mode === "minor" ? "minor" : "major";
          if (s.root !== k.pitchClass || s.scale !== newScale) {
            s.setKey(k.pitchClass, newScale);
          }
        }
      }
      setV((n) => n + 1);
    }, 400);

    return () => {
      clearInterval(interval);
      clearTimeout(t0);
      clearTimeout(t1);
      s.panic();
    };
  }, [engine, auto, s]);

  const currentScale = SCALES.find((x) => x.id === s.scale)!;
  const presetColor = DJ_PRESETS.find((p) => p.id === s.preset)!.color;

  return (
    <div className="hw-screwed hw-panel relative flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500">SYNTHÉ DJ</span>
        <span className="text-[10px] font-bold text-neutral-300">
          {NOTE_NAMES[s.root]} {currentScale.label}
        </span>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${auto ? "hw-btn-on" : ""}`}
          onClick={() => setAuto(!auto)}
        >
          AUTO
        </button>
      </div>

      <div className="hw-recess flex flex-wrap gap-1 p-1">
        {NOTE_NAMES.map((n, i) => (
          <button
            key={i}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${i === s.root ? "hw-btn-on" : ""}`}
            onClick={() => {
              s.setKey(i, s.scale);
              setAuto(false);
            }}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="hw-recess flex flex-wrap gap-1 p-1">
        {SCALES.map(({ id, label }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${id === s.scale ? "hw-btn-on" : ""}`}
            onClick={() => {
              s.setKey(s.root, id);
              setAuto(false);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="hw-recess flex flex-wrap gap-1 p-1">
        {DJ_PRESETS.map(({ id, glyph, label, color, title }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${id === s.preset ? "hw-btn-on" : ""}`}
            style={{ ["--led" as string]: color }}
            title={title}
            onClick={() => s.setPreset(id)}
          >
            {glyph} {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-8 gap-1">
        {[8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <PerfPad
            key={i}
            label={midiName(s.padMidi(i))}
            sub={String(i % currentScale.steps.length + 1)}
            color={presetColor}
            lit={i % currentScale.steps.length === 0}
            active={held.has(i)}
            height={50}
            onDown={() => {
              s.padDown(i, 1);
              setHeld(new Set(held).add(i));
            }}
            onUp={() => {
              s.padUp(i);
              if (!s.latch) setHeld(new Set([...held].filter((x) => x !== i)));
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHORDS.map(({ id, label }) => (
          <button
            key={id}
            className={`hw-btn px-2 py-1 text-[11px] font-bold ${id === s.chord ? "hw-btn-on" : ""}`}
            onClick={() => s.setChord(id)}
          >
            {label}
          </button>
        ))}
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => s.setOctave(s.octave - 1)}
        >
          OCT −
        </button>
        <span className="text-[10px] font-bold text-neutral-300">{s.octave}</span>
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => s.setOctave(s.octave + 1)}
        >
          OCT +
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${s.latch ? "hw-btn-on" : ""}`}
          onClick={() => s.setLatch(!s.latch)}
        >
          HOLD
        </button>
        <button
          className={`hw-btn px-2 py-1 text-[11px] font-bold ${s.quantize ? "hw-btn-on" : ""}`}
          onClick={() => s.setQuantize(!s.quantize)}
        >
          QUANT
        </button>
      </div>

      <div className="hw-recess flex flex-wrap items-center gap-1 p-1">
        <button
          className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${s.arp.on ? "hw-btn-on" : ""}`}
          onClick={() => s.setArp({ on: !s.arp.on })}
        >
          ARP
        </button>
        {ARP_PATTERNS.map(({ id, label }) => (
          <button
            key={id}
            className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${id === s.arp.pattern ? "hw-btn-on" : ""}`}
            onClick={() => s.setArp({ pattern: id })}
          >
            {label}
          </button>
        ))}
        {ARP_DIVS.map(({ label }, i) => (
          <button
            key={i}
            className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${i === s.arp.div ? "hw-btn-on" : ""}`}
            onClick={() => s.setArp({ div: i })}
          >
            {label}
          </button>
        ))}
        {[1, 2, 3].map((o) => (
          <button
            key={o}
            className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${o === s.arp.octaves ? "hw-btn-on" : ""}`}
            onClick={() => s.setArp({ octaves: o })}
          >
            {o} OCT
          </button>
        ))}
        <Knob
          label="Durée"
          value={s.arp.gate}
          min={0.1}
          max={1}
          defaultValue={0.5}
          onChange={(v) => s.setArp({ gate: v })}
          color={presetColor}
          size={44}
          led
          format={(v) => `${Math.round(v * 100)}%`}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <FxXyPad
          x={s.knobs.cutoff}
          y={s.knobs.reso}
          color={presetColor}
          labelX="Filtre"
          labelY="Réso"
          fmtX={(v) => {
            const hz = 80 * 200 ** v;
            return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
          }}
          fmtY={(v) => `${(0.5 + v * 15.5).toFixed(1)} dB`}
          defX={s.presetDef.cutoff}
          defY={s.presetDef.reso}
          onChange={(x, y) => {
            s.setKnob("cutoff", x);
            s.setKnob("reso", y);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Knob
            label="Volume"
            value={s.knobs.vol}
            min={0}
            max={1.5}
            defaultValue={0.8}
            onChange={(v) => {
              s.setKnob("vol", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Drive"
            value={s.knobs.drive}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("drive", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Env."
            value={s.knobs.env}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("env", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Glide"
            value={s.knobs.glide}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("glide", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Release"
            value={s.knobs.release}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("release", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Knob
            label="Wobble"
            value={s.knobs.wobble}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(v) => {
              s.setKnob("wobble", v);
              save();
              force();
            }}
            color={presetColor}
            size={44}
            led
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <div className="flex flex-wrap items-center gap-1">
            {[1, 2, 3, 5, 6].map((i) => (
              <button
                key={i}
                className={`hw-btn h-8 px-2 py-1 text-[11px] font-bold ${i === s.wobbleDiv ? "hw-btn-on" : ""}`}
                onClick={() => {
                  s.setWobbleDiv(i);
                  save();
                  force();
                }}
              >
                {BEAT_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {(["pump", "echo", "reverb", "sweep"] as FxName[]).map((name) => {
          return (
            <button
              key={name}
              className={`hw-btn px-2 py-1 text-[11px] font-bold ${s.fx.getWet(name as FxName) > 0 ? "hw-btn-on" : ""}`}
              onClick={() => s.fx.setWet(name as FxName, s.fx.getWet(name as FxName) > 0 ? 0 : 0.85)}
            >
              {name.toUpperCase()}
            </button>
          );
        })}
        <button
          className="hw-btn px-2 py-1 text-[11px] font-bold"
          onClick={() => setFxOpen(!fxOpen)}
        >
          TOUS LES EFFETS {fxOpen ? "▴" : "▾"}
        </button>
      </div>

      {fxOpen && <DjFxPanel rack={s.fx} color={presetColor} />}
    </div>
  );
}
