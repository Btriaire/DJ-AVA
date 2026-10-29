"use client";
import { useReducer, useState } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type HatMode } from "@/lib/audio/jamModules";
import type { FxName } from "@/lib/audio/fxTypes";
import { Knob } from "../Knob";
import { JamPad, JamSeg, JamShell, useJamRefresh } from "./JamKit";

const C = "#fb923c";
const pct = (v: number) => `${Math.round(v * 100)} %`;
// held fills: [key, label, sub, effect, beat division]
const FILLS: [string, string, string, FxName, number][] = [
  ["r4", "ROLL", "1/4", "roll", 0.25],
  ["r8", "ROLL", "1/8", "roll", 0.125],
  ["r16", "ROLL", "1/16", "roll", 0.0625],
  ["r32", "ROLL", "1/32", "roll", 0.03125],
  ["half", "HALF", "demi-tempo", "halftime", 1],
  ["build", "BUILD", "montée", "build", 1],
  ["scatter", "SCATTER", "1/8", "scatter", 0.125],
  ["stop", "STOP", "frein", "brake", 1],
];

// BEAT LAB: kick and clap layers on the song's own hits, generated hats with swing, rolls and fills on the drum stem
export function BeatLabPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).beat;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [held, setHeld] = useState<Record<string, boolean>>({});

  return (
    <JamShell title="Beat Lab" tag="sur le stem batterie" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()}>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="KICK+" value={m.kick} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.set("kick", v); bump(); }} />
        <Knob label="CLAP+" value={m.clap} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.set("clap", v); bump(); }} />
        <Knob label="HATS" value={m.hatLevel} min={0} max={1} defaultValue={0.7} color={C} size={46} led format={pct} onChange={(v) => { m.set("hatLevel", v); bump(); }} />
        <Knob label="SWING" value={m.swing} min={0} max={0.5} defaultValue={0} color={C} size={46} led format={(v) => `${Math.round(v * 200)} %`} onChange={(v) => { m.set("swing", v); bump(); }} />
        <Knob label="BATTERIE" value={m.level} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
      </div>
      <JamSeg label="Charleston" color={C} value={m.hats} options={[["off", "Off"], ["8", "Contretemps"], ["16", "Doubles"]] as const} onChange={(v: HatMode) => { m.set("hats", v); bump(); }} />
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
        {FILLS.map(([k, label, sub, fx, div]) => (
          <JamPad key={k} label={label} sub={sub} color={C} mode="hold" active={!!held[k]} onChange={(on) => { setHeld((h) => ({ ...h, [k]: on })); m.fx(fx, on, div, 1); }} />
        ))}
      </div>
      <p className="text-[10px] text-neutral-500">KICK+ et CLAP+ renforcent les coups du morceau, exactement sur ses temps. Les rolls se calent sur la grille.</p>
    </JamShell>
  );
}
