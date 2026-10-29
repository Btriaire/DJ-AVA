"use client";
import { useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type SynthMode } from "@/lib/audio/jamModules";
import { degreeNames } from "@/lib/audio/stemJam";
import { Knob } from "../Knob";
import { JamPad, JamSeg, JamShell, useJamRefresh } from "./JamKit";

const C = "#38bdf8";
const pct = (v: number) => `${Math.round(v * 100)} %`;
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

// SYNTH: an in-key synth on the "other" stem: arpeggio, offbeat stabs or pads on the song's chords, or the 7 chord pads
export function HarmoSynthPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).synth;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [held, setHeld] = useState<number | null>(null);
  const names = degreeNames(m.deck());

  return (
    <JamShell title="Synth" tag="dans la tonalité · stem autre" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }}>
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Jeu" color={C} value={m.mode} options={[["off", "Off"], ["arp", "Arpège"], ["stab", "Stabs"], ["pad", "Nappe"]] as const} onChange={(v: SynthMode) => { m.set("mode", v); bump(); }} />
        <JamSeg label="Pas" color={C} value={String(m.rate)} options={[["0.5", "1/8"], ["0.25", "1/16"]] as const} onChange={(v) => { m.set("rate", v === "0.5" ? 0.5 : 0.25); bump(); }} />
        <JamSeg label="Octave" color={C} value={String(m.octave)} options={[["-1", "-1"], ["0", "0"], ["1", "+1"]] as const} onChange={(v) => { m.set("octave", Number(v)); bump(); }} />
      </div>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="NIVEAU" value={m.level} min={0} max={1.5} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
        <Knob label="TIMBRE" value={m.tone} min={0} max={1} defaultValue={0.55} color={C} size={46} led format={pct} onChange={(v) => { m.setTone(v); bump(); }} />
        <Knob label="ORIGINAL" value={m.otherLevel} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setOtherLevel(v); bump(); }} />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {names.map((name, i) => (
          <JamPad key={ROMAN[i]} label={name} sub={ROMAN[i]} color={C} mode="hold" active={held === i} onChange={(on) => { setHeld(on ? i : null); m.hold(on ? i : null); }} />
        ))}
      </div>
      <p className="text-[10px] text-neutral-500">Les accords de la tonalité du morceau : impossible de jouer faux. Sans accord tenu, le synthé suit les accords du morceau.</p>
    </JamShell>
  );
}
