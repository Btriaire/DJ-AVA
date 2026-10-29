"use client";
import { useReducer } from "react";
import type { DJEngine } from "@/lib/audio/engine";
import { jamModules, type BassLine } from "@/lib/audio/jamModules";
import { Knob } from "../Knob";
import { JamPads, JamSeg, JamShell, useJamRefresh } from "./JamKit";
import { KEY_ROWS } from "./jamKeys";

const C = "#a78bfa";
const pct = (v: number) => `${Math.round(v * 100)} %`;

// BASS LAB: a sub that doubles the song's own bass notes, sidechain on its kicks, wobble, drop and bass swap
export function BassLabPanel({ engine }: { engine: DJEngine }) {
  const m = jamModules(engine).bass;
  useJamRefresh();
  const [, bump] = useReducer((x: number) => x + 1, 0);

  return (
    <JamShell title="Bass Lab" tag="sur le stem basse" color={C} status={m.status()} deckName={m.deck() === engine.deckA ? "A" : "B"} pref={m.pref} onPref={(p) => { m.set("pref", p); bump(); }} lit={() => m.lit()} warning={m.warning()} onReset={() => { m.reset(); bump(); }} stemsOff={m.canEnableStems()} onEnableStems={() => { m.enableStems(); bump(); }}>
      <div className="flex flex-wrap justify-around gap-2">
        <Knob label="SUB" value={m.subLevel} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setSub(v); bump(); }} />
        <Knob label="LIGNE" value={m.lineLevel} min={0} max={1.2} defaultValue={0.8} color={C} size={46} led format={pct} onChange={(v) => { m.setLineLevel(v); bump(); }} />
        <Knob label="DRIVE" value={m.drive} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setDrive(v); bump(); }} />
        <Knob label="TONE" value={m.tone} min={-1} max={1} defaultValue={0} color={C} size={46} led format={(v) => (v < -0.05 ? "LP" : v > 0.05 ? "HP" : "—")} onChange={(v) => { m.setTone(v); bump(); }} />
        <Knob label="WOBBLE" value={m.wobble} min={0} max={1} defaultValue={0} color={C} size={46} led format={pct} onChange={(v) => { m.setWobble(v); bump(); }} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <JamSeg label="Wobble" color={C} value={String(m.wobbleDiv)} options={[["0.5", "1/2"], ["0.25", "1/4"], ["0.125", "1/8"], ["0.0625", "1/16"]] as const} onChange={(v) => { m.setWobble(m.wobble, Number(v)); bump(); }} />
        <JamSeg label="Ligne de basse" color={C} value={m.line} options={[["off", "Off"], ["root", "Racine"], ["offbeat", "Contretemps"], ["octaves", "Octaves"], ["bounce", "Rebond"]] as const} onChange={(v: BassLine) => { m.set("line", v); bump(); }} />
        <JamSeg label="Sub" color={C} value={String(m.subOctave)} options={[["-12", "octave -1"], ["0", "unisson"]] as const} onChange={(v) => { m.set("subOctave", v === "0" ? 0 : -12); bump(); }} />
      </div>
      <JamPads m={m} list={m.pads()} color={C} className="grid grid-cols-3 gap-2 sm:grid-cols-6" keys={KEY_ROWS.bass} />
      <p className="text-[10px] text-neutral-500">SUB double les vraies notes de basse du morceau. LIGNE joue une basse tirée de ses accords : avec SWAP, elle remplace la basse d&apos;origine. PUMP fait respirer la basse sur chaque kick.</p>
    </JamShell>
  );
}
