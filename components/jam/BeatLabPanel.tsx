"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type HatMode } from "@/lib/audio/jamModules";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";
import { StepGrid } from "./StepGrid";

const C = "#fb923c";
const pct = (v: number) => `${Math.round(v * 100)} %`;

// BEAT LAB: kick and clap layers on the song's own hits, generated hats with swing, rolls and fills on the drum stem
export function BeatLabPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).beat;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  return (
    <JamShell title="Beat Lab" tag="sur le stem batterie" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} stemsLoading={m.stemsLoading()} onEnableStems={() => { void m.enableStems(); bump(); }}>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="KICK+" value={m.kick} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.set("kick", v); bump(); }} />
        <Knob label="CLAP+" value={m.clap} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.set("clap", v); bump(); }} />
        <Knob label="HATS" value={m.hatLevel} min={0} max={1} defaultValue={0.7} color={C} size={46} led format={pct} onChange={(v) => { m.set("hatLevel", v); bump(); }} />
        <Knob label="SWING" value={m.swing} min={0} max={0.5} defaultValue={0} color={C} size={46} led format={(v) => `${Math.round(v * 200)} %`} onChange={(v) => { m.set("swing", v); bump(); }} />
        <Knob label="BATTERIE" value={m.level} min={0} max={1.4} defaultValue={1} color={C} size={46} led format={pct} onChange={(v) => { m.setLevel(v); bump(); }} />
      </div>
      <JamSeg label="Charleston" color={C} value={m.hats} options={[["off", "Off"], ["8", "Contretemps"], ["16", "Doubles"]] as const} onChange={(v: HatMode) => { m.set("hats", v); bump(); }} />
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-4 gap-2 sm:grid-cols-8" keys={KEY_ROWS.beat} />
      <StepGrid beat={m} color={C} />
      <p className="text-[10px] text-neutral-500">KICK+ et CLAP+ renforcent les coups du morceau, exactement sur ses temps. Le séquenceur ajoute ton propre motif par-dessus, calé sur la mesure.</p>
    </JamShell>
  );
}
